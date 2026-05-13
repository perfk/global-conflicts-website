import { NextApiRequest, NextApiResponse } from "next";
import nextConnect from "next-connect";
import MyMongo from "../../../lib/mongodb";
import { CREDENTIAL } from "../../../middleware/check_auth_perms";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { hasCredsAny } from "../../../lib/credsChecker";

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '150mb',
        },
    },
};

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

    if (process.env.NODE_ENV !== "development") {
        return res.status(403).json({ error: "Forbidden: Import is only allowed in development environments." });
    }

    const data = req.body;
    if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: "Invalid payload format." });
    }

    const collectionsToImport = [
        "reforger_missions",
        "reforger_mission_metadata",
        "configs",
        "discord_users",
        "events",
        "users",
        "server_sessions"
    ];

    const db = (await MyMongo).db("prod");

    try {
        for (const colName of collectionsToImport) {
            if (data[colName] && Array.isArray(data[colName]) && data[colName].length > 0) {
                const collection = db.collection(colName);
                
                // Clear existing data
                await collection.deleteMany({});
                
                // Fix _id and dates to correct BSON types where possible, but insertMany handles raw JSON 
                // fairly well if _id strings aren't strictly required to be ObjectId (NextAuth uses strings mostly, 
                // but MongoDB native might need objectId parsing if they were native ObjectIds. For now, 
                // preserving _id as is from the export is usually fine for dev).
                
                // Note: Dates in JSON are strings, inserting them as strings might cause issues if the app 
                // expects Date objects. We will do a basic date string conversion.
                const documents = data[colName].map((doc: any) => {
                    const reviver = (key: string, value: any) => {
                        if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
                            return new Date(value);
                        }
                        return value;
                    };
                    return JSON.parse(JSON.stringify(doc), reviver);
                });

                await collection.insertMany(documents);
            }
        }
        res.status(200).json({ ok: true, message: "Database imported successfully." });
    } catch (err: any) {
        console.error("Import failed:", err);
        res.status(500).json({ error: `Import failed: ${err.message}` });
    }
});

export default apiRoute;
