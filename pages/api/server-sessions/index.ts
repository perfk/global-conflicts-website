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
            { $project: { 
                startedAt: 1, endedAt: 1, missionString: 1, missionUniqueName: 1,
                peakPlayerCount: 1, endReason: 1, isPlaceholder: 1, 
                discordMessageId: 1, discordThreadId: 1, discordMessageUrl: 1, 
                missionLinkSource: 1,
                snapshotCount: 1,
                "snapshots.connectedPlayers": 1
            } },
        ]).toArray(),
    ]);

    const playerMap = new Map<string, { playerName: string; inLatestSession: boolean }>();
    
    sessions.forEach((s, index) => {
        if (s.snapshots) {
            const isLatest = index === 0;
            s.snapshots.forEach((snap: any) => {
                if (snap.connectedPlayers) {
                    Object.entries(snap.connectedPlayers).forEach(([pid, name]) => {
                        const existing = playerMap.get(pid);
                        if (!existing) {
                            playerMap.set(pid, { playerName: name as string, inLatestSession: isLatest });
                        } else if (isLatest && !existing.inLatestSession) {
                            existing.inLatestSession = true;
                        }
                    });
                }
            });
            delete s.snapshots; // avoid sending bulk data to client
        }
    });

    const uniquePlayerEntries = Array.from(playerMap.entries());
    const platformIds = uniquePlayerEntries.map(([pid]) => pid);

    // Fetch mappings for these platformIds
    const mappings = await db.collection("player_mappings").find({
        platformId: { $in: platformIds }
    }).toArray();

    const mappingByPlatformId = new Map<string, string>();
    mappings.forEach(m => {
        if (m.discordId) mappingByPlatformId.set(m.platformId, m.discordId);
    });

    const discordIds = Array.from(new Set(mappings.map(m => m.discordId).filter(Boolean)));

    // Fetch users for these discordIds to check roles
    const users = await db.collection("users").find({
        discord_id: { $in: discordIds }
    }, { projection: { discord_id: 1, roles: 1 } }).toArray();

    const userRolesByDiscordId = new Map<string, any[]>();
    users.forEach(u => {
        userRolesByDiscordId.set(u.discord_id, u.roles ?? []);
    });

    const uniquePlayers = uniquePlayerEntries.map(([platformId, data]) => {
        const discordId = mappingByPlatformId.get(platformId);
        const roles = discordId ? userRolesByDiscordId.get(discordId) ?? [] : [];
        const isGMOrAdmin = roles.some((r: any) => r.name === "Admin" || r.name === "Arma GM");

        return {
            platformId,
            playerName: data.playerName,
            inLatestSession: data.inLatestSession,
            isGMOrAdmin
        };
    });

    // Sort: Latest session first, then alphabetical
    uniquePlayers.sort((a, b) => {
        if (a.inLatestSession && !b.inLatestSession) return -1;
        if (!a.inLatestSession && b.inLatestSession) return 1;
        return a.playerName.localeCompare(b.playerName);
    });

    // ── Enrichment logic: build a lookup by both missionId and uniqueName ──
    const missionSlugs = Array.from(new Set(sessions.map((s) => s.missionUniqueName).filter(Boolean)));
    
    // First, find the missions to get their missionIds since sessions only store missionUniqueName
    const missions = await db.collection("reforger_missions").find(
        { uniqueName: { $in: missionSlugs } },
        { projection: { missionId: 1, uniqueName: 1, tags: 1 } }
    ).toArray();

    const allMissionIds = new Set(missionSlugs);
    const missionTagsByUniqueName = new Map<string, string[]>();
    missions.forEach(m => {
        if (m.missionId) allMissionIds.add(m.missionId);
        if (m.uniqueName && m.tags) missionTagsByUniqueName.set(m.uniqueName, m.tags);
    });

    const metadataDocs = await db.collection("reforger_mission_metadata").find(
        { $or: [ { missionId: { $in: Array.from(allMissionIds) } }, { uniqueName: { $in: Array.from(allMissionIds) } } ] },
        { projection: { missionId: 1, uniqueName: 1, history: 1, status: 1, statusNotes: 1 } }
    ).toArray();

    // Create a map that keys off both missionId and uniqueName for reliable lookup
    const metadataByAnyId = new Map();
    metadataDocs.forEach(m => {
        const payload = { history: m.history ?? [], status: m.status, statusNotes: m.statusNotes };
        if (m.missionId) metadataByAnyId.set(m.missionId, payload);
        if (m.uniqueName) metadataByAnyId.set(m.uniqueName, payload);
    });

    // Also add mapping from the missions collection so uniqueName can resolve to missionId's history
    missions.forEach(m => {
        if (m.missionId && m.uniqueName && metadataByAnyId.has(m.missionId)) {
            metadataByAnyId.set(m.uniqueName, metadataByAnyId.get(m.missionId));
        }
    });

    const enrichedSessions = sessions.map((s) => {
        const metaPayload = metadataByAnyId.get(s.missionUniqueName) || { history: [], status: null, statusNotes: null };
        const history = metaPayload.history;
        
        // Match history entry to this session
        let match = history.find((h: any) => h.serverSessionId && String(h.serverSessionId) === String(s._id));
        
        if (!match) {
            const startedAt = new Date(s.startedAt).getTime();
            match = history.find((h: any) => {
                // Ignore history entries that are already linked to a different session
                if (h.serverSessionId && String(h.serverSessionId) !== String(s._id)) {
                    return false;
                }
                const historyDate = new Date(h.date).getTime();
                return Math.abs(historyDate - startedAt) < 2 * 60 * 60 * 1000;
            });
        }

        let stage = "loaded"; // Default: Needs History
        if (match) {
            if (match.outcome) stage = "outcome_added";
            else stage = "playing";
        }

        return {
            ...s,
            historyStatus: stage,
            missionStatus: metaPayload.status,
            missionStatusNotes: metaPayload.statusNotes,
            missionTags: missionTagsByUniqueName.get(s.missionUniqueName) || [],
            historyEntry: match ? {
                _id: match._id,
                outcome: match.outcome,
                leaders: match.leaders,
                discordMessageId: match.discordMessageId,
                discordThreadId: match.discordThreadId,
                discordMessageUrl: match.discordMessageUrl,
                date: match.date,
                gmNote: match.gmNote,
                aarReplayLink: match.aarReplayLink,
                serverSessionId: match.serverSessionId,
            } : null,
        };
    });

    res.status(200).json({ sessions: enrichedSessions, total, uniquePlayers });
});

export default apiRoute;
