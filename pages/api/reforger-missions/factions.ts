import { NextApiRequest, NextApiResponse } from "next";
import nextConnect from "next-connect";
import MyMongo from "../../../lib/mongodb";
import { CREDENTIAL } from "../../../middleware/check_auth_perms";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { hasCredsAny } from "../../../lib/credsChecker";

export interface FactionMapping {
    code: string;
    name: string;
    id: string;
    color?: string;
}

const apiRoute = nextConnect({
    onError(error, req: NextApiRequest, res: NextApiResponse) {
        res.status(500).json({ error: `${error.message}` });
    },
    onNoMatch(req, res: NextApiResponse) {
        res.status(405).json({ error: `Method '${req.method}' Not Allowed` });
    },
});

apiRoute.get(async (req: NextApiRequest, res: NextApiResponse) => {
    try {
        const db = (await MyMongo).db("prod");

        const [missions, configDoc] = await Promise.all([
            db.collection("reforger_missions").find({ factions: { $exists: true, $ne: [] } }).project({ factions: 1 }).toArray(),
            db.collection("configs").findOne({}, { projection: { faction_mappings: 1 } })
        ]);

        const distinctCodes = new Set<string>();
        for (const m of missions) {
            if (Array.isArray(m.factions)) {
                for (const f of m.factions) {
                    if (f.code) distinctCodes.add(f.code);
                }
            }
        }

        const codesArray = Array.from(distinctCodes).sort();
        const mappings: FactionMapping[] = configDoc?.faction_mappings || [];

        return res.status(200).json({ ok: true, codes: codesArray, mappings });
    } catch (error) {
        console.error("GET Factions Mapper error:", error);
        return res.status(500).json({ ok: false, error: "Internal server error." });
    }
});

apiRoute.post(async (req: NextApiRequest, res: NextApiResponse) => {
    const session = await getServerSession(req, res, authOptions);
    if (!hasCredsAny(session, [CREDENTIAL.ADMIN, CREDENTIAL.MISSION_REVIEWER])) {
        return res.status(401).json({ error: "Not Authorized" });
    }

    const { code, name, id, color } = req.body;

    if (!code) {
        return res.status(400).json({ error: "Faction code is required." });
    }

    try {
        const db = (await MyMongo).db("prod");
        const configsCollection = db.collection("configs");
        const configDoc = await configsCollection.findOne({});
        if (!configDoc) {
            return res.status(500).json({ ok: false, error: "Config document not found." });
        }

        const mappings: FactionMapping[] = configDoc?.faction_mappings || [];
        const index = mappings.findIndex((m) => m.code === code);

        if (name || id) {
            // Update or add
            const cleanName = typeof name === "string" ? name.trim() : "";
            const cleanId = typeof id === "string" ? id.trim() : "";
            const cleanColor = typeof color === "string" ? color.trim() : "";
            
            if (index > -1) {
                mappings[index].name = cleanName || mappings[index].name;
                mappings[index].id = cleanId || mappings[index].id;
                mappings[index].color = cleanColor || mappings[index].color;
            } else {
                mappings.push({ code, name: cleanName, id: cleanId, color: cleanColor });
            }
        } else {
            // Remove
            if (index > -1) mappings.splice(index, 1);
        }

        await configsCollection.updateOne(
            { _id: configDoc._id },
            { $set: { faction_mappings: mappings } }
        );

        return res.status(200).json({ ok: true });
    } catch (error) {
        console.error("POST Factions Mapper error:", error);
        return res.status(500).json({ ok: false, error: "Internal server error." });
    }
});

export default apiRoute;
