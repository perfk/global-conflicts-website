import Head from "next/head";
import ProfileLayout from "../../layouts/profile-layout";
import MyMongo from "../../lib/mongodb";
import React from "react";
import moment from "moment";
import DataTable from "react-data-table-component";
import { getSession } from "next-auth/react";
import dynamic from 'next/dynamic';

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

function getOutcomeClass(outcomeText: string): string {
    if (!outcomeText) return "";
    const t = outcomeText.toLowerCase();
    if (t.includes("blufor")) return "text-blufor";
    if (t.includes("opfor")) return "text-opfor";
    if (t.includes("indfor")) return "text-indfor";
    return "text-gray-500";
}

export default function UserSessions({ sessions, heatmapData }) {
    const [isMounted, setIsMounted] = React.useState(false);

    React.useEffect(() => {
        setIsMounted(true);
    }, []);

    const columns = [
        {
            name: "Date",
            selector: (row) => row.startedAt,
            sortable: true,
            width: "140px",
            format: (row) => isMounted ? moment(row.startedAt).format("MMM DD, HH:mm") : "",
        },
        {
            name: "Duration",
            selector: (row) => row.durationMins,
            sortable: true,
            width: "100px",
            format: (row) => `${row.durationMins}m`,
        },
        {
            name: "Mission",
            selector: (row) => row.missionName,
            sortable: true,
            grow: 2,
            cell: (row) => (
                <a 
                    href={`/reforger-missions/${row.uniqueName}`} 
                    className="hover:underline font-medium text-blue-600 dark:text-blue-400"
                >
                    {row.missionName}
                </a>
            )
        },
        {
            name: "Outcome",
            selector: (row) => row.outcome,
            sortable: true,
            width: "120px",
            cell: (row) => row.outcome ? (
                <span className={`font-bold uppercase text-xs ${getOutcomeClass(row.outcome)}`}>
                    {row.outcome}
                </span>
            ) : <span className="text-gray-400 text-xs">—</span>
        },
        {
            name: "AAR",
            width: "100px",
            cell: (row) => row.historyId ? (
                <a 
                    href={`/reforger-missions/${row.uniqueName}#history-${row.historyId}`}
                    className="badge badge-outline badge-sm hover:bg-standard hover:text-white transition-colors"
                >
                    View AAR
                </a>
            ) : null
        }
    ];

    const chartOptions: any = {
        chart: {
            type: 'bar',
            toolbar: { show: false },
            background: 'transparent'
        },
        plotOptions: {
            bar: {
                borderRadius: 4,
                columnWidth: '60%',
            }
        },
        dataLabels: { enabled: false },
        xaxis: {
            categories: heatmapData.labels,
            labels: { style: { colors: '#9ca3af', fontSize: '11px' } },
            axisBorder: { show: false },
            axisTicks: { show: false },
        },
        yaxis: {
            labels: { style: { colors: '#9ca3af' } },
            title: { text: 'Sessions', style: { color: '#9ca3af' } }
        },
        title: {
            text: 'Weekly Activity (Last 10 Weeks)',
            align: 'left',
            style: { color: '#9ca3af', fontSize: '12px' }
        },
        theme: { mode: 'dark' },
        colors: ["#22c55e"],
        grid: { borderColor: '#374151', strokeDashArray: 4 },
        tooltip: { theme: 'dark' }
    };

    const chartSeries = [
        { name: 'Sessions', data: heatmapData.values },
    ];

    if (!isMounted) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>My Play Sessions</title>
            </Head>

            <div className="space-y-8">
                <section>
                    <h2 className="text-xl font-bold mb-4 dark:text-gray-100">Activity Overview</h2>
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border dark:border-gray-700">
                        <Chart options={chartOptions} series={chartSeries} type="bar" height={250} />
                    </div>
                </section>

                <section>
                    <h2 className="text-xl font-bold mb-4 dark:text-gray-100">Session History</h2>
                    <div className="rounded-xl overflow-hidden border dark:border-gray-700 shadow-sm">
                        <DataTable
                            columns={columns}
                            data={sessions}
                            striped
                            highlightOnHover
                            pagination
                            defaultSortFieldId={1}
                            defaultSortAsc={false}
                            noDataComponent={<div className="p-8 text-gray-500">No sessions recorded for your account.</div>}
                        />
                    </div>
                </section>
            </div>
        </>
    );
}

export async function getServerSideProps(context) {
    const session = await getSession(context);
    if (!session) return { props: { sessions: [], heatmapData: [] } };

    const db = (await MyMongo).db("prod");
    const discordId = session.user["discord_id"];

    // 1. Resolve platformId
    const config = await db.collection("configs").findOne({}, { projection: { player_mappings: 1 } });
    const mapping = (config?.player_mappings ?? []).find(m => m.discordId === discordId);
    if (!mapping) return { props: { sessions: [], heatmapData: Array.from({ length: 7 }, () => Array(52).fill(0)) } };

    const platformId = mapping.platformId;

    // 2. Fetch sessions where this player appeared
    const userSessions = await db.collection("server_sessions")
        .find(
            { [`snapshots.connectedPlayers.${platformId}`]: { $exists: true } },
            { projection: { snapshots: 1, missionString: 1, missionUniqueName: 1, startedAt: 1, endedAt: 1 } }
        )
        .sort({ startedAt: -1 })
        .toArray();

    // 3. Fetch all mission history entries that might link to these sessions
    const sessionIds = userSessions.map(s => s._id);
    const metadataDocs = await db.collection("reforger_mission_metadata")
        .find(
            { "history.serverSessionId": { $in: sessionIds } },
            { projection: { history: 1 } }
        )
        .toArray();

    const historyMap = new Map();
    for (const doc of metadataDocs) {
        for (const entry of doc.history ?? []) {
            if (entry.serverSessionId) {
                historyMap.set(entry.serverSessionId.toString(), {
                    id: entry._id.toString(),
                    outcome: entry.outcome
                });
            }
        }
    }

    // 4. Process sessions for the table
    const processedSessions = userSessions.map(s => {
        const mySnaps = s.snapshots.filter(sn => sn.connectedPlayers?.[platformId]);
        if (mySnaps.length === 0) return null;

        const firstSeen = new Date(mySnaps[0].time);
        const lastSeen = new Date(mySnaps[mySnaps.length - 1].time);
        const durationMins = Math.round((lastSeen.getTime() - firstSeen.getTime()) / 60000);

        // Simple mission name extraction if uniqueName isn't matched
        const nameMatch = s.missionString.match(/^\w+\s+\(\d+-\d+\)\s+(.+)$/);
        const missionName = nameMatch ? nameMatch[1] : s.missionString;

        const history = historyMap.get(s._id.toString());

        return {
            id: s._id.toString(),
            startedAt: s.startedAt.getTime(),
            durationMins,
            missionName,
            uniqueName: s.missionUniqueName || "unknown",
            outcome: history?.outcome ?? null,
            historyId: history?.id ?? null
        };
    }).filter(Boolean);

    // 5. Build bar chart data (Last 10 weeks)
    const values = [];
    const labels = [];
    const now = moment();

    for (let i = 9; i >= 0; i--) {
        const targetWeek = moment(now).subtract(i, 'weeks');
        const weekNum = targetWeek.isoWeek();
        const weekYear = targetWeek.isoWeekYear();
        
        if (i === 0) labels.push("This Week");
        else if (i === 1) labels.push("Last Week");
        else labels.push(`W${weekNum}`);

        const count = processedSessions.filter(s => {
            const sessionDate = moment(s.startedAt);
            return sessionDate.isoWeek() === weekNum && sessionDate.isoWeekYear() === weekYear;
        }).length;
        
        values.push(count);
    }

    return {
        props: {
            sessions: JSON.parse(JSON.stringify(processedSessions)),
            heatmapData: { values, labels }
        }
    };
}

UserSessions.PageLayout = ProfileLayout;
