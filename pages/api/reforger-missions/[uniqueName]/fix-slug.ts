import { NextApiRequest, NextApiResponse } from "next";
import nextConnect from "next-connect";
import MyMongo from "../../../../lib/mongodb";
import { CREDENTIAL } from "../../../../middleware/check_auth_perms";
import { hasCredsAny } from "../../../../lib/credsChecker";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { findReforgerMissionBySlug } from "../../../../lib/missionsHelpers";

const apiRoute = nextConnect({
    onError(error, req: NextApiRequest, res: NextApiResponse) {
        res.status(500).json({ error: `${error.message}` });
    },
    onNoMatch(req, res: NextApiResponse) {
        res.status(405).json({ error: `Method '${req.method}' Not Allowed` });
    },
});

apiRoute.post(async (req: NextApiRequest, res: NextApiResponse) => {
    const { uniqueName } = req.query;

    const session = await getServerSession(req, res, authOptions);
    if (!hasCredsAny(session, [CREDENTIAL.ADMIN, CREDENTIAL.MISSION_REVIEWER])) {
        return res.status(401).json({ error: "Not Authorized" });
    }

    const db = (await MyMongo).db("prod");
    const mission = await findReforgerMissionBySlug(db, String(uniqueName), { missionId: 1, uniqueName: 1, name: 1 });
    if (!mission) {
        return res.status(404).json({ error: "Mission not found" });
    }

    const currentSlug: string = mission.uniqueName;

    // Check whether another mission already uses this slug
    const collision = await db.collection("reforger_missions").findOne(
        { uniqueName: currentSlug, _id: { $ne: mission._id } },
        { projection: { _id: 1 } }
    );

    if (!collision) {
        return res.status(200).json({ ok: true, changed: false, uniqueName: currentSlug });
    }

    // Find a free slug by appending _2, _3, …
    let newSlug = currentSlug;
    for (let n = 2; n < 1000; n++) {
        const candidate = `${currentSlug}_${n}`;
        const taken = await db.collection("reforger_missions").findOne(
            { uniqueName: candidate, _id: { $ne: mission._id } },
            { projection: { _id: 1 } }
        );
        if (!taken) {
            newSlug = candidate;
            break;
        }
    }

    if (newSlug === currentSlug) {
        return res.status(500).json({ error: "Could not find a free slug after 999 attempts" });
    }

    await db.collection("reforger_missions").updateOne(
        { _id: mission._id },
        { $set: { uniqueName: newSlug } }
    );

    return res.status(200).json({ ok: true, changed: true, uniqueName: newSlug });
});

export default apiRoute;
