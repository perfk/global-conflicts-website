import { NextApiRequest, NextApiResponse } from "next";
import nextConnect from "next-connect";
import MyMongo from "../../../lib/mongodb";
import { ObjectId } from "bson";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { hasCredsAny } from "../../../lib/credsChecker";
import { CREDENTIAL } from "../../../middleware/check_auth_perms";

const apiRoute = nextConnect({
	onError(error, req: NextApiRequest, res: NextApiResponse) {
		console.error(error);
		res.status(501).json({ error: `${error.message}` });
	},
	onNoMatch(req, res: NextApiResponse) {
		res.status(405).json({ error: `Method '${req.method}' Not Allowed` });
	},
});

apiRoute.get(async (req: NextApiRequest, res: NextApiResponse) => {
	const templates = await (await MyMongo).db("prod").collection("reforger_event_templates").find({}).toArray();
	res.status(200).json(templates);
});

apiRoute.post(async (req: NextApiRequest, res: NextApiResponse) => {
	const session = await getServerSession(req, res, authOptions);
	if (!hasCredsAny(session, [CREDENTIAL.ADMIN])) {
		return res.status(401).json({ error: `Not Authorized` });
	}

	const body = req.body;
	const template = {
		name: body.name,
		factions: body.factions, // This will be the new nested structure
		createdAt: new Date(),
		createdBy: session.user["discord_id"],
	};

	await (await MyMongo).db("prod").collection("reforger_event_templates").insertOne(template);
	res.status(200).json({ ok: true });
});

apiRoute.put(async (req: NextApiRequest, res: NextApiResponse) => {
	const session = await getServerSession(req, res, authOptions);
	if (!hasCredsAny(session, [CREDENTIAL.ADMIN])) {
		return res.status(401).json({ error: `Not Authorized` });
	}

	const body = req.body;
	await (await MyMongo).db("prod").collection("reforger_event_templates").updateOne(
		{ _id: new ObjectId(body._id) },
		{
			$set: {
				factions: body.factions,
				updatedAt: new Date(),
				updatedBy: session.user["discord_id"],
			}
		}
	);
	res.status(200).json({ ok: true });
});

apiRoute.delete(async (req: NextApiRequest, res: NextApiResponse) => {
	const session = await getServerSession(req, res, authOptions);
	if (!hasCredsAny(session, [CREDENTIAL.ADMIN])) {
		return res.status(401).json({ error: `Not Authorized` });
	}

	const id = req.query.id as string;
	await (await MyMongo).db("prod").collection("reforger_event_templates").deleteOne({ _id: new ObjectId(id) });
	res.status(200).json({ ok: true });
});

export default apiRoute;
