import { NextApiRequest, NextApiResponse } from "next";
import nextConnect from "next-connect";
import MyMongo from "../../../../lib/mongodb";
import { CREDENTIAL } from "../../../../middleware/check_auth_perms";
import { hasCredsAny } from "../../../../lib/credsChecker";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";

const apiRoute = nextConnect({
    onError(error, req: NextApiRequest, res: NextApiResponse) {
        res.status(500).json({ error: `${error.message}` });
    },
    onNoMatch(req, res: NextApiResponse) {
        res.status(405).json({ error: `Method '${req.method}' Not Allowed` });
    },
});

apiRoute.get(async (req: NextApiRequest, res: NextApiResponse) => {
    const { uniqueName } = req.query;

    const session = await getServerSession(req, res, authOptions);
    if (!hasCredsAny(session, [CREDENTIAL.ADMIN, CREDENTIAL.MISSION_REVIEWER])) {
        return res.status(401).json({ error: "Not Authorized" });
    }

    const db = (await MyMongo).db("prod");
    
    const mission = await db.collection("reforger_missions").findOne(
        { $or: [{ uniqueName: String(uniqueName) }, { missionId: String(uniqueName) }, { previousSlugs: String(uniqueName) }] }
    );

    if (!mission) {
        return res.status(404).json({ error: "Mission not found" });
    }

    const metadata = await db.collection("reforger_mission_metadata").findOne(
        { missionId: mission.missionId || mission.uniqueName }
    );

    const sessions = await db.collection("server_sessions").find(
        { missionUniqueName: mission.uniqueName }
    ).toArray();

    return res.status(200).json({
        reforger_missions: mission,
        reforger_mission_metadata: metadata,
        server_sessions: sessions
    });
});

export default apiRoute;
