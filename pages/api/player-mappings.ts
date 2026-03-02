import { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { hasCredsAny } from "../../lib/credsChecker";
import { CREDENTIAL } from "../../middleware/check_auth_perms";
import MyMongo from "../../lib/mongodb";

export interface PlayerMapping {
    platformId: string;
    playerName: string;
    discordId: string | null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { method } = req;
    const db = (await MyMongo).db("prod");
    const configsCollection = db.collection("configs");

    if (method === "GET") {
        const session = await getServerSession(req, res, authOptions);
        if (!hasCredsAny(session, [CREDENTIAL.ADMIN, CREDENTIAL.MISSION_REVIEWER])) {
            return res.status(401).json({ ok: false, error: "Unauthorized" });
        }

        try {
            const configDoc = await configsCollection.findOne(
                {},
                { projection: { player_mappings: 1 } }
            );
            const mappings: PlayerMapping[] = configDoc?.player_mappings ?? [];
            // Sort by playerName for a consistent, easy-to-scan list
            mappings.sort((a, b) => a.playerName.localeCompare(b.playerName));
            return res.status(200).json({ ok: true, mappings });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ ok: false, error: "Internal server error." });
        }
    }

    if (method === "POST") {
        const session = await getServerSession(req, res, authOptions);
        if (!hasCredsAny(session, [CREDENTIAL.ADMIN, CREDENTIAL.MISSION_REVIEWER])) {
            return res.status(401).json({ ok: false, error: "Unauthorized" });
        }

        try {
            const { platformId, discordId } = req.body;
            if (!platformId || typeof platformId !== "string") {
                return res.status(400).json({ ok: false, error: "Invalid 'platformId'." });
            }

            const cleanDiscordId = typeof discordId === "string" ? discordId.trim() : null;

            // Update existing entry if present, otherwise the bot will add it on next poll.
            // We only manage the discordId here — playerName is owned by the bot.
            const result = await configsCollection.updateOne(
                { "player_mappings.platformId": platformId },
                { $set: { "player_mappings.$.discordId": cleanDiscordId || null } }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({ ok: false, error: "Platform ID not found in mappings." });
            }

            return res.status(200).json({ ok: true });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ ok: false, error: "Internal server error." });
        }
    }

    if (method === "PUT") {
        const session = await getServerSession(req, res, authOptions);
        if (!hasCredsAny(session, [CREDENTIAL.ADMIN, CREDENTIAL.MISSION_REVIEWER])) {
            return res.status(401).json({ ok: false, error: "Unauthorized" });
        }

        try {
            const { changes } = req.body;
            if (!Array.isArray(changes)) {
                return res.status(400).json({ ok: false, error: "Invalid 'changes': expected array." });
            }

            let updated = 0;
            await Promise.all(
                changes.map(async ({ platformId, discordId }: { platformId: string; discordId: string | null }) => {
                    if (!platformId || typeof platformId !== "string") return;
                    const cleanDiscordId = typeof discordId === "string" ? discordId.trim() || null : null;
                    const result = await configsCollection.updateOne(
                        { "player_mappings.platformId": platformId },
                        { $set: { "player_mappings.$.discordId": cleanDiscordId } }
                    );
                    if (result.matchedCount > 0) updated++;
                })
            );

            return res.status(200).json({ ok: true, updated });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ ok: false, error: "Internal server error." });
        }
    }

    res.setHeader("Allow", ["GET", "POST", "PUT"]);
    return res.status(405).end(`Method ${method} Not Allowed`);
}
