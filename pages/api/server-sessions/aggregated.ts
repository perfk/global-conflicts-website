import { NextApiRequest, NextApiResponse } from "next";
import nextConnect from "next-connect";
import MyMongo from "../../../lib/mongodb";
import moment from "moment";

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

        const { startDate, endDate } = req.query;

        let windowStart: Date;
        let windowEnd: Date;

        if (startDate && endDate) {
            windowStart = new Date(startDate as string);
            windowEnd = new Date(endDate as string);
        } else {
            // Default to last 6 months
            windowStart = new Date();
            windowStart.setMonth(windowStart.getMonth() - 6);
            windowEnd = new Date();
        }

        const sessions = await db.collection("server_sessions").find({
            startedAt: { $gte: windowStart, $lte: windowEnd },
            snapshots: { $exists: true, $not: { $size: 0 } }
        }).project({
            "snapshots.time": 1,
            "snapshots.players": 1,
            "snapshots.connectedPlayers": 1,
            startedAt: 1
        }).sort({ startedAt: 1 }).toArray();

        if (sessions.length === 0) {
            return res.status(200).json({ aggregated: [] });
        }

        // Flatten all snapshots efficiently
        const allSnapshots: any[] = [];
        for (const s of sessions) {
            if (s.snapshots) {
                for (const snap of s.snapshots) {
                    allSnapshots.push(snap);
                }
            }
        }

        // Ensure chronological order
        allSnapshots.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

        const aggregated: any[] = [];
        let currentSession: any = null;

        const INACTIVITY_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

        const finalizeSession = (session: any) => {
            const startDate = new Date(session.start);
            const endDate = new Date(session.lastActive);
            let dateLabel = moment(startDate).format("D MMM (ddd)");
            if (startDate.getDate() !== endDate.getDate() || startDate.getMonth() !== endDate.getMonth()) {
                dateLabel = `${moment(startDate).format("D MMM (ddd)")}-${moment(endDate).format("ddd")}`;
            }

            return {
                label: dateLabel,
                timestamp: session.start,
                peak: session.peak,
                average: Math.round(session.sumPlayers / session.count),
                unique: session.uniques.size
            };
        };

        allSnapshots.forEach(snap => {
            const time = new Date(snap.time).getTime();
            const players = snap.players || 0;

            if (players > 0) {
                if (!currentSession) {
                    // Start new session
                    currentSession = {
                        start: time,
                        peak: players,
                        sumPlayers: players,
                        count: 1,
                        uniques: new Set(Object.keys(snap.connectedPlayers || {})),
                        lastActive: time
                    };
                } else {
                    // Check if we should have ended due to gap, but now we have players again
                    // If the gap was > 30 mins, we should have already closed it.
                    if (time - currentSession.lastActive > INACTIVITY_THRESHOLD_MS) {
                        aggregated.push(finalizeSession(currentSession));
                        currentSession = {
                            start: time,
                            peak: players,
                            sumPlayers: players,
                            count: 1,
                            uniques: new Set(Object.keys(snap.connectedPlayers || {})),
                            lastActive: time
                        };
                    } else {
                        currentSession.peak = Math.max(currentSession.peak, players);
                        currentSession.sumPlayers += players;
                        currentSession.count += 1;
                        currentSession.lastActive = time;
                        Object.keys(snap.connectedPlayers || {}).forEach(id => currentSession.uniques.add(id));
                    }
                }
            } else {
                // Players == 0
                if (currentSession) {
                    if (time - currentSession.lastActive > INACTIVITY_THRESHOLD_MS) {
                        aggregated.push(finalizeSession(currentSession));
                        currentSession = null;
                    }
                }
            }
        });

        if (currentSession) {
            aggregated.push(finalizeSession(currentSession));
        }

        return res.status(200).json({ aggregated });
    } catch (error) {
        console.error("Aggregated Stats API error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

export default apiRoute;
