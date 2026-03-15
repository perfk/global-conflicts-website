import { NextApiRequest, NextApiResponse } from "next";
import nextConnect from "next-connect";
import { ObjectId } from "mongodb";
import MyMongo from "../../../lib/mongodb";
import { CREDENTIAL } from "../../../middleware/check_auth_perms";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { hasCredsAny } from "../../../lib/credsChecker";

const apiRoute = nextConnect({
    onError(error, req: NextApiRequest, res: NextApiResponse) {
        res.status(500).json({ error: `${error.message}` });
    },
    onNoMatch(req, res: NextApiResponse) {
        res.status(405).json({ error: `Method '${req.method}' Not Allowed` });
    },
});

apiRoute.get(async (req: NextApiRequest, res: NextApiResponse) => {
    const session = await getServerSession(req, res, authOptions);
    if (!hasCredsAny(session, [CREDENTIAL.ADMIN, CREDENTIAL.MISSION_REVIEWER])) {
        return res.status(401).json({ error: "Not Authorized" });
    }

    const { id } = req.query;
    const db = (await MyMongo).db("prod");
    const doc = await db.collection("server_sessions").findOne({ _id: new ObjectId(id as string) });

    if (!doc) return res.status(404).json({ error: "Session not found" });

    res.status(200).json(doc);
});

apiRoute.patch(async (req: NextApiRequest, res: NextApiResponse) => {
    const session = await getServerSession(req, res, authOptions);
    if (!hasCredsAny(session, [CREDENTIAL.ADMIN, CREDENTIAL.MISSION_REVIEWER])) {
        return res.status(401).json({ error: "Not Authorized" });
    }

    const { id } = req.query;
    const { missionUniqueName } = req.body;

    const db = (await MyMongo).db("prod");

    let update: any;
    if (missionUniqueName) {
        update = { $set: { missionUniqueName, missionLinkSource: "manual" } };
    } else {
        // Clearing the match — let auto-matcher retry on next session open
        update = { $set: { missionUniqueName: null }, $unset: { missionLinkSource: "" } };
    }

    await db.collection("server_sessions").updateOne(
        { _id: new ObjectId(id as string) },
        update
    );

    res.status(200).json({ ok: true });
});

apiRoute.delete(async (req: NextApiRequest, res: NextApiResponse) => {
    const session = await getServerSession(req, res, authOptions);
    if (!hasCredsAny(session, [CREDENTIAL.ADMIN, CREDENTIAL.MISSION_REVIEWER])) {
        return res.status(401).json({ error: "Not Authorized" });
    }

    const { id } = req.query;
    const db = (await MyMongo).db("prod");
    await db.collection("server_sessions").deleteOne({ _id: new ObjectId(id as string) });

    res.status(200).json({ ok: true });
});

export default apiRoute;
