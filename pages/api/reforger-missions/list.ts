import MyMongo from "../../../lib/mongodb";

export default async function handler(req, res) {
	const missions = await (await MyMongo).db("prod").collection("reforger_missions").aggregate([
		{
			$lookup: {
				from: "users",
				localField: "authorID",
				foreignField: "discord_id",
				as: "missionMaker",
			},
		},
		{
			$lookup: {
				from: "reforger_mission_metadata",
				localField: "missionId",
				foreignField: "missionId",
				as: "metadata",
			},
		},
		{
			$addFields: {
				historyCount: { $size: { $ifNull: [{ $arrayElemAt: ["$metadata.history", 0] }, []] } },
				status: { $arrayElemAt: ["$metadata.status", 0] },
				statusNotes: { $arrayElemAt: ["$metadata.statusNotes", 0] }
			}
		},
		{
			$project: {
				image: 0,
				reviewChecklist: 0,
				ratios: 0,
				history: 0,
				updates: 0,
				reports: 0,
				metadata: 0,
			},
		},
	]).toArray();

	res.status(200).json(missions);
}
