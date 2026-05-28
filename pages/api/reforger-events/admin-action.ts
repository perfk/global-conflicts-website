import { NextApiRequest, NextApiResponse } from "next";
import nextConnect from "next-connect";
import MyMongo from "../../../lib/mongodb";
import { ObjectId } from "bson";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { hasCredsAny } from "../../../lib/credsChecker";
import { CREDENTIAL } from "../../../middleware/check_auth_perms";

const apiRoute = nextConnect({
	onError(error, req: NextApiRequest, res: NextApiResponse) {
		console.error(error);
		res.status(501).json({ error: `${error.message}` });
	},
	onNoMatch(req, res: NextApiResponse) {
		res.status(405).json({ error: `Method '${req.method}' Not Allowed` });
	},
});

apiRoute.post(async (req: NextApiRequest, res: NextApiResponse) => {
	const session = await getServerSession(req, res, authOptions);
	if (!hasCredsAny(session, [CREDENTIAL.ADMIN])) {
		return res.status(401).json({ error: `Not Authorized` });
	}

	const { eventId, action, discordId, playerName, missionId, factionId, slotId } = req.body;
	const db = (await MyMongo).db("prod");

	if (action === "remove") {
		// If we only have playerName, we need to find the user first
		let filter = {};
		if (discordId) {
			filter = { discord_id: discordId };
		} else {
			filter = { $or: [{ username: playerName }, { nickname: playerName }] };
		}

		await db.collection("users").updateOne(
			{ ...filter, "eventsSignedUp.eventId": new ObjectId(eventId) },
			{
				$pull: {
					"eventsSignedUp.$.reservedSlots": { _id: new ObjectId(slotId) }
				}
			}
		);

		// Re-check first mission signups for this user
		const updatedUser = await db.collection("users").findOne(filter);
		const eventFound = await db.collection("reforger_events").findOne({ _id: new ObjectId(eventId) });
		const firstMissionId = eventFound.eventMissionList?.[0]?._id?.toString();
		const hasFirstMissionSlot = updatedUser?.eventsSignedUp
			?.find(e => e.eventId.toString() === eventId)
			?.reservedSlots?.some(s => s.missionId.toString() === firstMissionId);

		if (!hasFirstMissionSlot) {
			await db.collection("reforger_events").updateOne(
				{ _id: new ObjectId(eventId) },
				{ $pull: { signups: updatedUser.discord_id } }
			);
		}

		return res.status(200).json({ ok: true });
	}

	if (action === "assign") {
		const { eventId, discordId, username, nickname, missionId, factionId, slotId } = req.body;
		const event = await db.collection("reforger_events").findOne({ _id: new ObjectId(eventId) });
		if (!event) return res.status(404).json({ error: "Event not found" });

		const mission = event.eventMissionList.find(m => m._id.toString() === missionId);
		const faction = mission.factions.find(f => f._id.toString() === factionId);
		
		let slot = null;
		if (faction.groups) {
			for (const group of faction.groups) {
				slot = group.slots.find(s => s._id.toString() === slotId);
				if (slot) break;
			}
		} else {
			slot = faction.slots.find(s => s._id.toString() === slotId);
		}

		const reservation = {
			_id: new ObjectId(slotId),
			slotName: slot.name,
			factionName: faction.name,
			factionId: new ObjectId(factionId),
			missionName: mission.name,
			missionId: new ObjectId(missionId),
		};

		// Ensure user has the event in their signedUp list
		let user = await db.collection("users").findOne({ discord_id: discordId });
		
		if (!user) {
			// Create a stub user if they haven't logged in before
			await db.collection("users").insertOne({
				discord_id: discordId,
				username: username,
				nickname: nickname,
				roles: [],
				eventsSignedUp: []
			});
			user = await db.collection("users").findOne({ discord_id: discordId });
		}
		
		// Remove any existing reservation for THIS mission only
		const otherMissionReservations = user.eventsSignedUp
			?.find(e => e.eventId.toString() === eventId)
			?.reservedSlots?.filter(slot => slot.missionId.toString() !== missionId.toString()) || [];

		const finalReservedSlots = [...otherMissionReservations, reservation];

		const eventSignedUp = user.eventsSignedUp?.find(e => e.eventId.toString() === eventId);

		if (!eventSignedUp) {
			await db.collection("users").updateOne(
				{ discord_id: discordId },
				{
					$addToSet: {
						eventsSignedUp: {
							eventId: new ObjectId(eventId),
							reservedSlots: finalReservedSlots
						}
					}
				}
			);
		} else {
			await db.collection("users").updateOne(
				{ discord_id: discordId, "eventsSignedUp.eventId": new ObjectId(eventId) },
				{
					$set: {
						"eventsSignedUp.$.reservedSlots": finalReservedSlots
					}
				}
			);
		}

		// Update the signups array in the event document
		const firstMissionId = event.eventMissionList?.[0]?._id?.toString();
		const hasFirstMissionSlot = finalReservedSlots.some(s => s.missionId.toString() === firstMissionId);
		if (hasFirstMissionSlot) {
			await db.collection("reforger_events").updateOne(
				{ _id: new ObjectId(eventId) },
				{ $addToSet: { signups: discordId } }
			);
		} else {
			await db.collection("reforger_events").updateOne(
				{ _id: new ObjectId(eventId) },
				{ $pull: { signups: discordId } }
			);
		}

		return res.status(200).json({ ok: true });
	}

	res.status(400).json({ error: "Invalid action" });
});

export default apiRoute;
