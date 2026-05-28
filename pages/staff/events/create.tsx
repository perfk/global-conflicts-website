import { Listbox, Tab, Transition } from "@headlessui/react";
import { CheckIcon, ExclamationIcon, TrashIcon, ChevronDoubleDownIcon } from "@heroicons/react/outline";

import Head from "next/head";

import React, { Fragment, useEffect, useRef, useState } from "react";
import ReactMde from "react-mde";

import CreateSlotsModal from "../../../components/modals/create_slots_modal";
import EventDatePickerModal from "../../../components/modals/event_datepicker_modal";
import EventNavBarFactionItem from "../../../components/event_navbar_faction_item";
import { ISideNavItem } from "../../../interfaces/navbar_item";

import "react-mde/lib/styles/css/react-mde-editor.css";
import "react-mde/lib/styles/css/react-mde-suggestions.css";
import "react-mde/lib/styles/css/react-mde-toolbar.css";
import "react-mde/lib/styles/css/react-mde.css";
import AddIcon from "../../../components/icons/add";
import { toast } from "react-toastify";
import { useFormik } from "formik";

import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import axios from "axios";
import { getSession, useSession } from "next-auth/react";
import EventEditingCard from "../../../components/reforger_event_editing_card";
import { CredentialLockLayout } from "../../../layouts/credential-lock-layout";
import { CREDENTIAL } from "../../../middleware/check_auth_perms";
import { generateMarkdown } from "../../../lib/markdownToHtml";
import EventsSlotsCreation from "../../../components/reforger_event_slots_creation";
import DeleteIcon from "../../../components/icons/delete";

function classNames(...classes) {
	return classes.filter(Boolean).join(" ");
}

function EventsDashboardPage({ clonedEvent }) {
	const [showFactionsTip, setShowFactionsTip] = React.useState(true);
	const [isLoading, setIsLoading] = useState(false);
	const { data: session, status } = useSession();

	useEffect(() => {
		const doNotShowFactionsTip = localStorage.getItem("doNotShowFactionsTip");
		setShowFactionsTip(!doNotShowFactionsTip);
	}, [session]);

	const [datePickerModalOpen, setDatePickerModalOpen] = useState(false);
	const [createSlotsModalOpen, setCreateSlotsModalOpen] = useState(false);

	const [eventcoverMediaObjectUrl, setEventcoverMediaObjectUrl] = useState(null);
	const [eventcoverMediaSocialObjectUrl, setEventcoverMediaSocialObjectUrl] =
		useState(null);
	const videoRef = useRef(null);

	const onEventCoverMediaChange = (event) => {
		if (event.target.files && event.target.files[0]) {
			const i = event.target.files[0];
			eventDataFormik.setFieldValue("eventCoverMedia", i);
			const objurl = URL.createObjectURL(i);
			setEventcoverMediaObjectUrl(objurl);
			setTimeout(() => {
				if (videoRef.current) {
					videoRef.current.defaultMuted = true;
					videoRef.current.muted = true;
				}
			}, 20);
		}
	};

	const onEventCoverMediaSocialChange = (event) => {
		if (event.target.files && event.target.files[0]) {
			const i = event.target.files[0];
			eventDataFormik.setFieldValue("eventCoverMediaSocial", i);
			const objurl = URL.createObjectURL(i);
			setEventcoverMediaSocialObjectUrl(objurl);
		}
	};

	const [eventContentPages, setEventContentPages] = useState<ISideNavItem[]>(clonedEvent?.contentPages ?? [
		{
			title: "Summary",
			type: null,
			markdownContent: "Type the summary here",
		},
	]);

	const [currentContentPage, setCurrentContentPage] = useState(
		eventContentPages[0]
	);

	const [selectedNoteTab, setSelectedNoteTab] = React.useState<
		"write" | "preview"
	>("write");

	const [newSectionTitle, setNewSectionTitle] = useState("");

	const eventDataFormik = useFormik({
		initialValues: {
			eventName: clonedEvent?.name ? `${clonedEvent.name} (Clone)` : "",
			eventDescription: clonedEvent?.description ?? "",
			youtubeLink: clonedEvent?.youtubeLink ?? "",
			eventSlotCount: clonedEvent?.slots ?? 0,
			eventCoverMedia: null,
			eventCoverMediaSocial: null,
			eventOrganizer: session?.user
				? session.user["nickname"] ?? session.user["username"]
				: "",
			eventStartDate: clonedEvent?.when ? new Date(clonedEvent.when) : null,
		},
		validate: validateFields,
		onSubmit: (values) => {
			if (isLoading) {
				return;
			}
			setIsLoading(true);
			const config = {
				headers: { "content-type": "multipart/form-data" },
				onUploadProgress: (event) => { },
			};

			const formData = new FormData();

			formData.append(
				"eventJsonData",
				JSON.stringify({
					eventName: values.eventName,
					youtubeLink: values.youtubeLink,
					eventDescription: values.eventDescription,
					eventSlotCount: values.eventSlotCount,
					eventOrganizer: values.eventOrganizer,
					eventStartDate: values.eventStartDate,
					eventContentPages,
					eventMissionList,
				})
			);
			formData.append("eventCoverMedia", values.eventCoverMedia);
			formData.append("eventCoverMediaSocial", values.eventCoverMediaSocial);

			axios
				.post("/api/reforger-events", formData, config)
				.then((response) => {
					eventDataFormik.resetForm();
					toast.success("Event submited, redirecting to it...");
					setTimeout(() => {
						window.open(`/reforger-events/${response.data.slug}`, "_self");
					}, 2000);
				})
				.catch((error) => {
					toast.error("Error submiting event");
					setIsLoading(false);
				});
		},
	});

	function validateFields(values) {
		let errors = {};
		if (values.eventName.trim().length < 4) {
			errors["eventName"] = "Too short. Min 4 characters.";
		}
		if (values.eventName.trim().length > 35) {
			errors["eventName"] = "Too long. Max 35 characters.";
		}
		if (values.eventDescription.trim().length > 200) {
			errors["eventDescription"] = "Too long. Max 200 characters.";
		}
		if (values.eventDescription.trim().length < 4) {
			errors["eventDescription"] = "Too short. Min 4 characters.";
		}
		if (values.eventOrganizer.trim() == "") {
			errors["eventOrganizer"] = "Required.";
		}
		if (!values.eventCoverMedia) {
			errors["eventCoverMedia"] = "Event cover media required.";
		}
		if (!values.eventCoverMediaSocial) {
			errors["eventCoverMediaSocial"] = "Event social image required.";
		}
		if (!values.eventStartDate) {
			errors["eventStartDate"] = "Time and date required.";
		}

		return errors;
	}

	const calculateMaxPlayers = () => {
		if (!eventMissionList || eventMissionList.length === 0) return 0;
		const firstMission = eventMissionList[0];
		let total = 0;
		firstMission.factions.forEach(f => {
			f.groups?.forEach(g => {
				total += g.slots?.length ?? 0;
			});
		});
		return total;
	};

	useEffect(() => {
		const newCount = calculateMaxPlayers();
		if (newCount !== eventDataFormik.values.eventSlotCount) {
			eventDataFormik.setFieldValue("eventSlotCount", newCount);
		}
	}, [eventMissionList]);

	function isVideo() {
		return (
			eventDataFormik.values.eventCoverMedia?.type.includes("mp4") ||
			eventDataFormik.values.eventCoverMedia?.type.includes("webm")
		);
	}

	const defaultMission = {
		name: "Default Mission", factions: [{
			name: "Default Faction",
			groups: [],
			slots: []
		}]
	};
	const [eventMissionList, setEventMissionList] = useState(clonedEvent?.eventMissionList ?? [defaultMission])
	const [selectedMission, setSelectedMission] = useState(clonedEvent?.eventMissionList ? clonedEvent.eventMissionList[0] : defaultMission)


	return (
        <CredentialLockLayout session={session} cred={CREDENTIAL.ADMIN}>
            <Head>
				<title>Create Event</title>
			</Head>
            <div className="max-w-screen-xl px-5 mx-auto mt-24">
				<form onSubmit={eventDataFormik.handleSubmit} className="mb-10">
					<div className="flex flex-row justify-between">
						<div className="prose text-gray-900 dark:text-gray-100">
						 							<h1 className="text-gray-900 dark:text-white font-black uppercase tracking-tighter">Creating new event</h1>
						 						</div>
						<button
							className={
								isLoading ? "btn btn-lg btn-primary loading" : "btn btn-lg btn-primary"
							}
							type="submit"
						>
							{isLoading ? "SUBMITING EVENT..." : "SUBMIT EVENT"}
						</button>
					</div>

					<div className="flex flex-row justify-between mt-10 space-x-6 items-top">
						<div className="flex-1 form-control">
							<label className="label">
								<span className="label-text text-gray-700 dark:text-gray-300 font-bold uppercase text-xs tracking-widest">Event Name</span>
							</label>
							<input
								type="text"
								placeholder="Event Name"
								onChange={eventDataFormik.handleChange}
								onBlur={eventDataFormik.handleBlur}
								value={eventDataFormik.values.eventName}
								name={"eventName"}
								className="input input-lg input-bordered font-bold"
							/>
							<span className="text-red-500 label-text-alt">
								<>{eventDataFormik.errors.eventName}</>
							</span>
						</div>

						<div className="flex flex-col">
							<label className="label">
								<span className="label-text text-gray-700 dark:text-gray-300 font-bold uppercase text-xs tracking-widest">Cover media</span>
							</label>
							<label className="btn btn-primary btn-lg">
								<input type="file" onChange={onEventCoverMediaChange} className="hidden" />
								Select Image, GIF or Video
							</label>
							<span className="text-red-500 label-text-alt">
								<>{eventDataFormik.errors.eventCoverMedia}</>
							</span>
						</div>
					</div>
					<div className="flex flex-row justify-between space-x-2 mt-4">
						<div className="flex-1 form-control">
							<label className="label">
								<span className="label-text text-gray-700 dark:text-gray-300 font-bold uppercase text-xs tracking-widest">Description</span>
							</label>
							<textarea
								placeholder="Description"
								onChange={eventDataFormik.handleChange}
								onBlur={eventDataFormik.handleBlur}
								value={eventDataFormik.values.eventDescription}
								name={"eventDescription"}
								className="h-24 textarea textarea-bordered"
							/>
							<span className="text-red-500 label-text-alt">
								<>{eventDataFormik.errors.eventDescription}</>
							</span>
						</div>
					</div>

					<div className="flex flex-row space-x-6 items-top mt-4">
						<div className="flex flex-col">
							<label className="label">
								<span className="label-text text-gray-700 dark:text-gray-300 font-bold uppercase text-xs tracking-widest">Time and date</span>
							</label>
							<button
								className="btn btn-lg btn-outline"
								type={"button"}
								onClick={() => {
									setDatePickerModalOpen(true);
								}}
							>
								Select Time & Date
							</button>
							<span className="text-red-500 label-text-alt">
								<>{eventDataFormik.errors.eventStartDate}</>
							</span>
						</div>
						<div className="form-control">
							<label className="label">
								<span className="label-text text-gray-700 dark:text-gray-300 font-bold uppercase text-xs tracking-widest">Max players (Auto)</span>
							</label>
							<input
								type="tel"
								disabled
								value={eventDataFormik.values.eventSlotCount}
								className="input input-bordered input-lg font-mono text-center"
							/>
						</div>
						<div className="form-control flex-grow">
							<label className="label">
								<span className="label-text text-gray-700 dark:text-gray-300 font-bold uppercase text-xs tracking-widest">Organizer</span>
							</label>
							<input
								type="text"
								onBlur={eventDataFormik.handleBlur}
								value={eventDataFormik.values.eventOrganizer}
								onChange={eventDataFormik.handleChange}
								name={"eventOrganizer"}
								className="input input-bordered input-lg"
							/>
						</div>
					</div>
					<div className="flex flex-row space-x-6 mt-4">
						<div className="flex-1 form-control">
							<label className="label">
								<span className="label-text text-gray-700 dark:text-gray-300 font-bold uppercase text-xs tracking-widest">Youtube video URL</span>
							</label>
							<input
								type="text"
								placeholder="Youtube link"
								onChange={eventDataFormik.handleChange}
								onBlur={eventDataFormik.handleBlur}
								value={eventDataFormik.values.youtubeLink}
								name={"youtubeLink"}
								className="input input-lg input-bordered"
							/>
						</div>
						<div className="flex flex-col">
							<label className="label">
								<span className="label-text text-gray-700 dark:text-gray-300 font-bold uppercase text-xs tracking-widest">Social Media Image</span>
							</label>
							<label className="btn btn-primary btn-lg">
								<input type="file" onChange={onEventCoverMediaSocialChange} className="hidden" />
								Select Social Image
							</label>
							<span className="text-red-500 label-text-alt">
								<>{eventDataFormik.errors.eventCoverMediaSocial}</>
							</span>
						</div>
					</div>
				</form>

				<EventEditingCard
					objectURL={eventcoverMediaObjectUrl}
					isVideo={isVideo()}
					eventDescription={eventDataFormik.values.eventDescription}
					eventName={eventDataFormik.values.eventName}
					eventSlotCount={eventDataFormik.values.eventSlotCount}
					eventStartDate={eventDataFormik.values.eventStartDate}
				></EventEditingCard>

				<div className="w-full px-2 mt-12 mb-40 sm:px-0">
					<Tab.Group>
						<Tab.List className="flex p-1 space-x-1 bg-gray-100 dark:bg-gray-800 rounded-2xl">
							<Tab className={({ selected }) => classNames("w-full py-3 text-sm leading-5 font-bold rounded-xl transition-all outline-none", selected ? "bg-white dark:bg-gray-700 text-primary shadow-lg" : "text-gray-500 hover:text-primary")}>
								Event Content
							</Tab>
							<Tab className={({ selected }) => classNames("w-full py-3 text-sm leading-5 font-bold rounded-xl transition-all outline-none", selected ? "bg-white dark:bg-gray-700 text-primary shadow-lg" : "text-gray-500 hover:text-primary")}>
								Reservable Slots
							</Tab>
						</Tab.List>
						<Tab.Panels className="mt-4">
							<Tab.Panel>
								<div className="flex flex-row bg-white dark:bg-gray-800 rounded-2xl border dark:border-gray-700 overflow-hidden shadow-xl">
									<aside className="w-64 bg-gray-50 dark:bg-gray-900/50 border-r dark:border-gray-700 p-4">
										<div className="flex space-x-2 mb-6">
											<input
												placeholder="New Section..."
												value={newSectionTitle}
												onChange={(e) => setNewSectionTitle(e.target.value)}
												className="input input-sm input-bordered flex-grow"
											/>
											<button className="btn btn-sm btn-primary" onClick={() => {
												if (!newSectionTitle.trim()) return;
												if (eventContentPages.find(p => p.title === newSectionTitle)) return toast.error("Page exists");
												setEventContentPages([...eventContentPages, { title: newSectionTitle, type: null, markdownContent: "" }]);
												setNewSectionTitle("");
											}}><AddIcon /></button>
										</div>
										<div className="space-y-1">
											{eventContentPages.map((page) => (
												<div key={page.title} className={classNames("flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all", currentContentPage.title === page.title ? "bg-primary/10 text-primary border border-primary/20" : "hover:bg-gray-100 dark:hover:bg-gray-700")} onClick={() => setCurrentContentPage(page)}>
													<span className="text-sm font-medium">{page.title}</span>
													{page.title !== "Summary" && <TrashIcon height={14} className="text-error" onClick={(e) => {
														e.stopPropagation();
														setEventContentPages(eventContentPages.filter(p => p.title !== page.title));
														if (currentContentPage.title === page.title) setCurrentContentPage(eventContentPages[0]);
													}} />}
												</div>
											))}
										</div>
									</aside>
									<main className="flex-grow">
										<ReactMde
											initialEditorHeight={600}
											value={currentContentPage.markdownContent}
											onChange={(val) => {
												currentContentPage.markdownContent = val;
												setEventContentPages([...eventContentPages]);
											}}
											selectedTab={selectedNoteTab}
											onTabChange={setSelectedNoteTab}
											generateMarkdownPreview={async (markdown) => (
												<div className="prose dark:prose-invert max-w-none p-4" dangerouslySetInnerHTML={{ __html: generateMarkdown(markdown, false) }} />
											)}
										/>
									</main>
								</div>
							</Tab.Panel>

							<Tab.Panel>
								<div className="flex flex-col h-[700px] border dark:border-gray-700 rounded-2xl overflow-hidden shadow-2xl mt-4">
									<EventsSlotsCreation
										eventMissionList={eventMissionList}
										setEventMissionList={setEventMissionList}
										selectedMission={selectedMission}
										setSelectedMission={setSelectedMission}
									/>
								</div>
							</Tab.Panel>
						</Tab.Panels>
					</Tab.Group>
				</div>
			</div>
            <EventDatePickerModal
				initialDate={eventDataFormik.values.eventStartDate}
				onDateSelect={(date) => eventDataFormik.setFieldValue("eventStartDate", date)}
				isOpen={datePickerModalOpen}
				onClose={() => setDatePickerModalOpen(false)}
			/>
        </CredentialLockLayout>
    );
}

export default EventsDashboardPage;

export async function getServerSideProps(context) {
	const session = await getSession(context);
	const { clone } = context.query;
	let clonedEvent = null;

	if (clone) {
		const MyMongo = (await import("../../../lib/mongodb")).default;
		clonedEvent = await (await MyMongo).db("prod").collection("reforger_events").findOne({
			slug: clone,
		});

		if (clonedEvent) {
			clonedEvent._id = clonedEvent._id.toString();
			clonedEvent.eventMissionList?.forEach(mission => {
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
	}

	return {
		props: { session, clonedEvent },
	};
}
