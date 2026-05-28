import Head from "next/head";

import React from "react";

import MyMongo from "../../../lib/mongodb";

import moment from "moment";

import DataTable from "react-data-table-component";
import { CredentialLockLayout } from "../../../layouts/credential-lock-layout";
import { getSession, useSession } from "next-auth/react";
import { CREDENTIAL } from "../../../middleware/check_auth_perms";

export default function DashboardEventList({ events }) {
	const columns = [
		{
			name: "Name",
			selector: (row) => row.name,
			sortable: true,
			width: "180px",
		},
		{
			name: "Organizer",
			selector: (row) => row.organizer,
			sortable: true,
			width: "180px",
			compact: true,
		},
		{
			name: "Date",
			selector: (row) => row.when,
			sortable: true,
			width: "90px",
			compact: true,
			format: (row) => moment(row.when).format("ll"),
		},
		{
			name: "Status",
			selector: (row) => {
				return row.closeReason
					? row.closeReason.label
					: moment(row.when) <= moment()
						? "Happening now"
						: "Upcoming";
			},
			sortable: true,
			compact: true,
			width: "180px",
		},
		{
			name: "Slots",
			selector: (row) => row.slots,
			sortable: true,
			width: "90px",
			compact: true,
		},
		{
			name: "Sign ups",
			selector: (row) => row.signups?.length,
			sortable: true,
			width: "90px",
			compact: true,
		},

		{
			name: "# of participants",
			selector: (row) => row.numberOfParticipants,
			sortable: true,
			compact: true,
			width: "130px",
		},
		{
			name: "# of \"Can't Make it\"",
			selector: (row) => row.cantMakeItCount,
			sortable: true,
			compact: true,
			width: "130px",
		},
		{
			name: "Actions",
			cell: (row) => (
				<button 
					className="btn btn-xs btn-outline"
					onClick={(e) => {
						e.stopPropagation();
						window.location.href = `/staff/events/create?clone=${row.slug}`;
					}}
				>
					Clone
				</button>
			),
			ignoreRowClick: true,
			allowOverflow: true,
			button: true,
		},
	];
	const { data: session } = useSession();
	return (
		<CredentialLockLayout session={session} cred={CREDENTIAL.ADMIN}>
			<Head>
				<title>Dashboard - Event List</title>
			</Head>

			<div className="flex flex-col max-w-screen-xl px-2 mx-auto mb-10">
				<div className="mx-4 mt-10 prose lg:prose-xl text-gray-900 dark:text-gray-100" style={{ maxWidth: "none" }}>
					<h1>List of events</h1>
				</div>

				<div className="w-full px-2 py-16 sm:px-0 overflow-x-auto">
					<table className="table w-full dark:bg-gray-800 dark:text-gray-100">
						<thead>
							<tr>
								<th className="dark:bg-gray-700">Name</th>
								<th className="dark:bg-gray-700">Organizer</th>
								<th className="dark:bg-gray-700">Date</th>
								<th className="dark:bg-gray-700">Status</th>
								<th className="dark:bg-gray-700 text-center">Slots</th>
								<th className="dark:bg-gray-700 text-center">Signups</th>
								<th className="dark:bg-gray-700 text-center">Actions</th>
							</tr>
						</thead>
						<tbody>
							{events.map((row) => (
								<tr 
									key={row.slug} 
									className="hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
									onClick={() => window.open(`/staff/events/${row.slug}/edit`, "_self")}
								>
									<td className="font-bold">{row.name}</td>
									<td>{row.organizer}</td>
									<td>{moment(row.when).format("ll")}</td>
									<td>
										{row.closeReason
											? <span className="badge badge-ghost">{row.closeReason.label}</span>
											: moment(row.when) <= moment()
												? <span className="badge badge-success text-white font-bold">LIVE</span>
												: <span className="badge badge-info text-white font-bold">UPCOMING</span>
										}
									</td>
									<td className="text-center font-mono">{row.slots}</td>
									<td className="text-center font-mono">{row.signups?.length || 0}</td>
									<td className="text-center">
										<button 
											className="btn btn-xs btn-outline btn-primary"
											onClick={(e) => {
												e.stopPropagation();
												window.location.href = `/staff/events/create?clone=${row.slug}`;
											}}
										>
											Clone
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</CredentialLockLayout>
	);
}

export async function getServerSideProps(context) {
	const session = await getSession(context);
	const events = await (await MyMongo).db("prod").collection("reforger_events")
		.find({}, { projection: { contentPages: 0 } })
		.toArray();

	for (const event of events) {
		const cantMakeItCount = await (await MyMongo).db("prod").collection("users")
			.find({
				cantMakeIt: { $in: [{ eventId: event._id.toString() }] },
			})
			.toArray();

		event["cantMakeItCount"] = cantMakeItCount.length;
		delete event["_id"];

		event.eventMissionList?.forEach(mission => {
			mission._id = mission._id.toString();
			mission.factions.forEach(faction => {
				faction._id = faction._id.toString();
				faction.groups?.forEach(group => {
					group._id = group._id.toString();
					group.slots.forEach(slot => {
						slot._id = slot._id.toString();
					});
				});
			});
		});
	}
	return { props: { events, session } };
}
