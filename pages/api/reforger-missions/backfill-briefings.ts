import { NextApiRequest, NextApiResponse } from "next";
import nextConnect from "next-connect";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { CREDENTIAL } from "../../../middleware/check_auth_perms";
import { hasCredsAny } from "../../../lib/credsChecker";
import { backfillMissionBriefings } from "../../../lib/reforger-github-sync";

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

    try {
        const triggeredBy = {
            discord_id: session.user["discord_id"],
            username: session.user["nickname"] || session.user["username"] || "Unknown",
        };
        const results = await backfillMissionBriefings(triggeredBy);
        return res.status(200).json({ ok: true, results });
    } catch (error) {
        console.error("Backfill Briefings Error:", error);
        return res.status(500).json({ error: error.message });
    }
});

export default apiRoute;
