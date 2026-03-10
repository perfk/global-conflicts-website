import { NextApiRequest, NextApiResponse } from "next";
import nextConnect from "next-connect";
import MyMongo from "../../../lib/mongodb";
import { CREDENTIAL } from "../../../middleware/check_auth_perms";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { hasCredsAny } from "../../../lib/credsChecker";
import { extractMissionFactions, getFullRepoTree } from "../../../lib/reforger-github-sync";
import { logReforgerAction, LOG_ACTION } from "../../../lib/logging";

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
    if (!hasCredsAny(session, [CREDENTIAL.ADMIN, CREDENTIAL.MISSION_REVIEWER, CREDENTIAL.GM])) {
        return res.status(401).json({ error: "Not Authorized" });
    }

    const db = (await MyMongo).db("prod");
    const missions = await db.collection("reforger_missions")
        .find({ githubPath: { $exists: true, $ne: null } })
        .project({ _id: 1, githubPath: 1, missionId: 1, uniqueName: 1 })
        .toArray();

    const tree = await getFullRepoTree();
    const results = { updated: 0, skipped: 0, errors: 0 };

    for (const mission of missions) {
        const parts = (mission.githubPath as string).split('/');
        if (parts.length < 3) { results.errors++; continue; }

        const worldFolder = `worlds/${parts[1]}/${parts[2].replace('.conf', '')}`;
        try {
            const factions = await extractMissionFactions(worldFolder, tree, db);
            if (factions && factions.length > 0) {
                const filter = mission.missionId ? { missionId: mission.missionId } : { _id: mission._id };
                await db.collection("reforger_missions").updateOne(filter, { $set: { factions } });
                results.updated++;
            } else {
                results.skipped++;
            }
        } catch (e) {
            console.warn(`[Sync Factions] Error for ${mission.githubPath}: ${e.message}`);
            results.errors++;
        }
    }

    await logReforgerAction(
        LOG_ACTION.SYNC_INCREMENTAL, // Use incremental or a new action type if desired, but this works
        {
            status: "Success",
            stats: { added: 0, updated: results.updated, errors: results.errors },
            note: "Global Faction Sync"
        },
        { discord_id: session.user["discord_id"], username: session.user["username"] }
    );

    return res.status(200).json(results);
});

export default apiRoute;
