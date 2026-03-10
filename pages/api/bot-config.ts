import { NextApiRequest, NextApiResponse } from "next";
import nextConnect from "next-connect";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { CREDENTIAL } from "../../middleware/check_auth_perms";
import { hasCredsAny } from "../../lib/credsChecker";
import MyMongo from "../../lib/mongodb";

const apiRoute = nextConnect({
    onError(error, req: NextApiRequest, res: NextApiResponse) {
        res.status(501).json({ error: `${error.message}` });
    },
    onNoMatch(req, res: NextApiResponse) {
        res.status(405).json({ error: `Method '${req.method}' Not Allowed` });
    },
});

apiRoute.get(async (req: NextApiRequest, res: NextApiResponse) => {
    const session = await getServerSession(req, res, authOptions);
    if (!hasCredsAny(session, [CREDENTIAL.ADMIN])) {
        return res.status(401).json({ error: "Not Authorized" });
    }

    try {
        const db = (await MyMongo).db("prod");
        const configs = await db.collection("configs").findOne({}, { projection: { botPollIntervalMs: 1 } });
        return res.status(200).json({ intervalMs: configs?.botPollIntervalMs ?? 120000 });
    } catch (error) {
        console.error("bot-config GET error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

apiRoute.post(async (req: NextApiRequest, res: NextApiResponse) => {
    const session = await getServerSession(req, res, authOptions);
    if (!hasCredsAny(session, [CREDENTIAL.ADMIN])) {
        return res.status(401).json({ error: "Not Authorized" });
    }

    const { intervalMs } = req.body;
    if (typeof intervalMs !== "number" || intervalMs < 5000) {
        return res.status(400).json({ error: "Invalid interval" });
    }

    try {
        const db = (await MyMongo).db("prod");
        await db.collection("configs").updateOne(
            {},
            { $set: { botPollIntervalMs: intervalMs } },
            { upsert: true }
        );
        return res.status(200).json({ ok: true });
    } catch (error) {
        console.error("bot-config POST error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

export default apiRoute;
