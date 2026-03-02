import { NextApiRequest, NextApiResponse } from "next";
import nextConnect from "next-connect";
import MyMongo from "../../../lib/mongodb";
import { CREDENTIAL } from "../../../middleware/check_auth_perms";
import { hasCredsAny } from "../../../lib/credsChecker";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";

const apiRoute = nextConnect({
    onError(error, req: NextApiRequest, res: NextApiResponse) {
        res.status(500).json({ error: `${error.message}` });
    },
    onNoMatch(req, res: NextApiResponse) {
        res.status(405).json({ error: `Method '${req.method}' Not Allowed` });
    },
});

apiRoute.post(async (req: NextApiRequest, res: NextApiResponse) => {
    const session = await getServerSession(req, res, authOptions);
    if (!hasCredsAny(session, [CREDENTIAL.ADMIN, CREDENTIAL.MISSION_REVIEWER])) {
        return res.status(401).json({ error: "Not Authorized" });
    }

    const db = (await MyMongo).db("prod");

    // Find all missions with duplicate uniqueNames
    const duplicates = await db.collection("reforger_missions").aggregate([
        { $group: { _id: "$uniqueName", count: { $sum: 1 }, missions: { $push: { _id: "$_id", name: "$name", missionId: "$missionId" } } } },
        { $match: { count: { $gt: 1 } } },
    ]).toArray();

    if (duplicates.length === 0) {
        return res.status(200).json({ ok: true, fixed: 0, details: [] });
    }

    // Build a set of all slugs currently in use (for collision checking as we rename)
    const allSlugs = new Set<string>(
        (await db.collection("reforger_missions").distinct("uniqueName")).map(String)
    );

    const details: { from: string; to: string; name: string; missionId?: string }[] = [];

    for (const group of duplicates) {
        const baseName: string = group._id;
        const missions: { _id: any; name: string; missionId?: string }[] = group.missions;

        // Keep the first (oldest by insertion order = smallest ObjectId) unchanged.
        // Rename all others.
        const toRename = missions.slice(1);

        for (const mission of toRename) {
            // Find the next free slug
            let newSlug = baseName;
            for (let n = 2; n < 1000; n++) {
                const candidate = `${baseName}_${n}`;
                if (!allSlugs.has(candidate)) {
                    newSlug = candidate;
                    break;
                }
            }

            if (newSlug === baseName) {
                // Extremely unlikely but guard anyway
                continue;
            }

            await db.collection("reforger_missions").updateOne(
                { _id: mission._id },
                { $set: { uniqueName: newSlug } }
            );

            allSlugs.add(newSlug);
            details.push({ from: baseName, to: newSlug, name: mission.name, missionId: mission.missionId });
        }
    }

    return res.status(200).json({ ok: true, fixed: details.length, details });
});

export default apiRoute;
