import { NextApiRequest, NextApiResponse } from "next";
import nextConnect from "next-connect";
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
    if (!hasCredsAny(session, [CREDENTIAL.ADMIN, CREDENTIAL.MISSION_REVIEWER, CREDENTIAL.GM])) {
        return res.status(401).json({ error: "Not Authorized" });
    }

    const { limit = 20, skip = 0, search, endReason, startDate, endDate } = req.query;

    const query: any = {};

    if (search) {
        query.missionString = { $regex: search, $options: "i" };
    }

    if (endReason === "active") {
        query.endedAt = null;
    } else if (endReason && endReason !== "all") {
        query.endReason = endReason;
    }

    if (startDate || endDate) {
        query.startedAt = {};
        if (startDate) query.startedAt.$gte = new Date(startDate as string);
        if (endDate) query.startedAt.$lte = new Date(endDate as string);
    }

    const db = (await MyMongo).db("prod");

    const [total, sessions] = await Promise.all([
        db.collection("server_sessions").countDocuments(query),
        db.collection("server_sessions").aggregate([
            { $match: query },
            { $sort: { startedAt: -1 } },
            { $skip: Number(skip) },
            { $limit: Number(limit) },
            { $addFields: { snapshotCount: { $size: "$snapshots" } } },
            { $project: { snapshots: 0 } },
        ]).toArray(),
    ]);

    res.status(200).json({ sessions, total });
});

export default apiRoute;
