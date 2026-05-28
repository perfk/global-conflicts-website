import  { CREDENTIAL } from "../../../middleware/check_auth_perms";
import MyMongo from "../../../lib/mongodb";
import { NextApiRequest, NextApiResponse } from "next";
import { ModifyResult, ObjectId } from "mongodb";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { hasCredsAny } from "../../../lib/credsChecker";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse
) {
	if (req.method != "POST") {
		res.status(404).send("");
	}

	
	const session = await getServerSession(req, res, authOptions);

    if (!hasCredsAny(session, [CREDENTIAL.MEMBER])) {
        return res.status(401).json({ error: `You must be a member in order to reserve slots` });
    }


 
	const eventMissionList = req.body.eventMissionList;

	const eventId = req.body.eventId;
	const eventObjectId = new ObjectId(eventId);

	const eventFound = await (await MyMongo).db("prod").collection("reforger_events").findOne({
		_id: eventObjectId,
	});
	if (!eventFound) {
		return res.status(400);
	}
	var factionTitle = "";


	var userReservedSlots = [];

	//check if there are slots avaliable
	for (const mission of eventMissionList) {

		//find mission
		const dbMissionFound = eventFound.eventMissionList.filter((dbMission => dbMission._id.toString() == mission._id))[0]
		//iterate the factions of the sent obj
		for (const faction of mission.factions) {
			//if there is a reserved slot:
			if (mission.reservedSlot) {

				//check remaining slots
				const dbFactionFound = dbMissionFound.factions.filter((dbFaction => dbFaction._id.toString() == faction._id))[0]
				
				let dbSlotFound = null;
				let dbGroupFound = null;
				if (dbFactionFound.groups) {
					for (const group of dbFactionFound.groups) {
						dbSlotFound = group.slots.filter((dbSlot => dbSlot._id.toString() == mission.reservedSlot._id))[0]
						if (dbSlotFound) {
							dbGroupFound = group;
							break;
						}
					}
				} else if (dbFactionFound.slots) {
					dbSlotFound = dbFactionFound.slots.filter((dbSlot => dbSlot._id.toString() == mission.reservedSlot._id))[0]
				}

				if (dbSlotFound) {
					if (dbSlotFound.isLocked || dbGroupFound?.isLocked) {
						return res.status(400).send(dbSlotFound.lockMessage || dbGroupFound?.lockMessage || "This slot is locked.");
					}

					if ((dbSlotFound?.reserves?.length ?? 0) >= Number.parseInt(dbSlotFound["count"])) {
						return res.status(400).send("A slot you want is fully reserved.");
					}
					userReservedSlots.push({
						_id: dbSlotFound._id,
						slotName: dbSlotFound.name,
						factionName: dbFactionFound.name,
						factionId: dbFactionFound._id,
						missionName: dbMissionFound.name,
						missionId: dbMissionFound._id,
					})
				}

			}
		}
	}



	const db = (await MyMongo).db("prod");
	const user = await db.collection("users").findOne({ discord_id: session.user["discord_id"] });
	const eventSignedUp = user.eventsSignedUp?.find(e => e.eventId.toString() === eventId);

	// Get existing reservations for other missions
	const otherMissionReservations = user.eventsSignedUp
		?.find(e => e.eventId.toString() === eventId)
		?.reservedSlots?.filter(slot => !userReservedSlots.some(newSlot => newSlot.missionId.toString() === slot.missionId.toString())) || [];

	const finalReservedSlots = [...otherMissionReservations, ...userReservedSlots];

	if (!eventSignedUp) {
		await db.collection("users").updateOne(
			{ discord_id: session.user["discord_id"] },
			{
				$addToSet: {
					eventsSignedUp: {
						eventId: eventObjectId,
						reservedSlots: finalReservedSlots
					}
				}
			}
		);
	} else {
		await db.collection("users").updateOne(
			{ discord_id: session.user["discord_id"], "eventsSignedUp.eventId": eventObjectId },
			{
				$set: {
					"eventsSignedUp.$.reservedSlots": finalReservedSlots
				}
			}
		);
	}

	// Update the signups array in the event document for faster counting on listing pages
	const firstMissionId = eventFound.eventMissionList?.[0]?._id?.toString();
	const hasFirstMissionSlot = finalReservedSlots.some(s => s.missionId.toString() === firstMissionId);
	if (hasFirstMissionSlot) {
		await db.collection("reforger_events").updateOne(
			{ _id: eventObjectId },
			{ $addToSet: { signups: session.user["discord_id"] } }
		);
	} else {
		await db.collection("reforger_events").updateOne(
			{ _id: eventObjectId },
			{ $pull: { signups: session.user["discord_id"] } }
		);
	}

	return res.status(200).send("");
}

// Run the middleware
