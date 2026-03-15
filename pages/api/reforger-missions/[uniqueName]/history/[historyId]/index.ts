import { NextApiRequest, NextApiResponse } from "next";
import nextConnect from "next-connect";
import MyMongo from "../../../../../../lib/mongodb";
import { ObjectId } from "bson";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../../auth/[...nextauth]";
import { hasCredsAny } from "../../../../../../lib/credsChecker";
import { CREDENTIAL } from "../../../../../../middleware/check_auth_perms";
import { findReforgerMissionBySlug } from "../../../../../../lib/missionsHelpers";

const apiRoute = nextConnect({
    onError(error, req: NextApiRequest, res: NextApiResponse) {
        res.status(501).json({ error: `${error.message}` });
    },
    onNoMatch(req, res: NextApiResponse) {
        res.status(405).json({ error: `Method '${req.method}' Not Allowed` });
    },
});

// PATCH: update serverSessionId on a specific history entry
apiRoute.patch(async (req: NextApiRequest, res: NextApiResponse) => {
    const { uniqueName, historyId } = req.query;
    const { serverSessionId } = req.body;

    const session = await getServerSession(req, res, authOptions);
    if (!hasCredsAny(session, [CREDENTIAL.ADMIN, CREDENTIAL.GM, CREDENTIAL.MISSION_REVIEWER])) {
        return res.status(401).json({ error: "Not Authorized" });
    }

    const db = (await MyMongo).db("prod");
    const mission = await findReforgerMissionBySlug(db, String(uniqueName), { missionId: 1, uniqueName: 1 });
    if (!mission) {
        return res.status(404).json({ error: "Mission not found" });
    }

    const missionId = mission.missionId || mission.uniqueName;
    const historyObjectId = new ObjectId(historyId as string);
    const cleanSessionId = serverSessionId
        ? new ObjectId(serverSessionId as string)
        : null;

    await db.collection("reforger_mission_metadata").updateOne(
        { missionId },
        { $set: { "history.$[historyArray].serverSessionId": cleanSessionId } },
        { arrayFilters: [{ "historyArray._id": historyObjectId }] }
    );

    return res.status(200).json({ ok: true });
});

export default apiRoute;
