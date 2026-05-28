import { Listbox, Tab, Transition } from "@headlessui/react";
import { CheckIcon, ChevronDoubleDownIcon, ExclamationIcon, TrashIcon } from "@heroicons/react/outline";

import Head from "next/head";

import React, { Fragment, useEffect, useRef, useState } from "react";
import ReactMde from "react-mde";

import CreateSlotsModal from "../../../../components/modals/create_slots_modal";
import EventDatePickerModal from "../../../../components/modals/event_datepicker_modal";
import EventNavBarFactionItem from "../../../../components/event_navbar_faction_item";
import { ISideNavItem } from "../../../../interfaces/navbar_item";

import "react-mde/lib/styles/css/react-mde-editor.css";
import "react-mde/lib/styles/css/react-mde-toolbar.css";
import "react-mde/lib/styles/css/react-mde-toolbar.css";
import "react-mde/lib/styles/css/react-mde.css";
import AddIcon from "../../../../components/icons/add";
import { toast } from "react-toastify";
import { useFormik } from "formik";

import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import axios from "axios";
import { getSession, useSession } from "next-auth/react";
import EventEditingCard from "../../../../components/reforger_event_editing_card";

import MyMongo from "../../../../lib/mongodb";

import CloseEventModal from "../../../../components/modals/close_event_modal";
import { CredentialLockLayout } from "../../../../layouts/credential-lock-layout";
import { CREDENTIAL } from "../../../../middleware/check_auth_perms";
import { generateMarkdown } from "../../../../lib/markdownToHtml";
import prism from "prismjs";
require("prismjs/components/prism-sqf");

import "prismjs/themes/prism-okaidia.css";
import DeleteIcon from "../../../../components/icons/delete";
import EventsSlotsCreation from "../../../../components/reforger_event_slots_creation";

function classNames(...classes) {
	return classes.filter(Boolean).join(" ");
}

export default function EditEvent({ event }) {
	const [isLoading, setIsLoading] = useState(false);
	const [showFactionsTip, setShowFactionsTip] = React.useState(true);
	const { data: session } = useSession();

	useEffect(() => {
		const doNotShowFactionsTip = localStorage.getItem("doNotShowFactionsTip");
		setShowFactionsTip(!doNotShowFactionsTip);
	}, [session]);

	const [datePickerModalOpen, setDatePickerModalOpen] = useState(false);
	const [closeModalOpen, setCloseModalOpen] = useState(false);
	const [createSlotsModalOpen, setCreateSlotsModalOpen] = useState(false);
	const [objectUrl, setObjectUrl] = useState(event.imageLink);
	const [isVideo, setIsVideo] = useState(
		event.imageLink?.includes("mp4") || event.imageLink?.includes("webm")
	);

	const videoRef = useRef(null);
	const displayImage = (event) => {
		if (event.target.files && event.target.files[0]) {
			const file = event.target.files[0];
			eventDataFormik.setFieldValue("eventCoverMedia", file);
			setObjectUrl(URL.createObjectURL(file));
			setIsVideo(file?.type.includes("mp4") || file?.type.includes("webm"));
			setTimeout(() => {
				if (videoRef.current) {
					videoRef.current.defaultMuted = true;
					videoRef.current.muted = true;
				}
			}, 20);
		}
	};

	const [eventContentPages, setEventContentPages] = useState<ISideNavItem[]>(
		event.contentPages
	);

	const [currentContentPage, setCurrentContentPage] = useState(
		event.contentPages[0]
	);

	const [selectedNoteTab, setSelectedNoteTab] = React.useState<
		"write" | "preview"
	>("write");

	const [newSectionTitle, setNewSectionTitle] = useState("");

	const [isPaused, setIsPaused] = useState(event.isPaused ?? false);

	const eventDataFormik = useFormik({
		initialValues: {
			eventName: event.name,
			eventDescription: event.description,
			eventSlotCount: event.slots,
			eventCoverMedia: null,
			eventOrganizer: event.organizer ?? "",
			eventStartDate: new Date(event.when),
			youtubeLink: event.youtubeLink ?? "",
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
					_id: event._id,
					eventName: values.eventName,
					eventDescription: values.eventDescription,
					eventSlotCount: values.eventSlotCount,
					eventOrganizer: values.eventOrganizer,
					eventStartDate: values.eventStartDate,
					eventContentPages,
					eventMissionList,
					youtubeLink: values.youtubeLink,
					isPaused,
				})
			);
			formData.append("eventCoverMedia", values.eventCoverMedia);

			axios
				.put("/api/reforger-events", formData, config)
				.then((response) => {
					eventDataFormik.resetForm();
					toast.success("Event edited, redirecting to it...");
					setTimeout(() => {
						window.open(`/reforger-events/${response.data.slug}`, "_self");
					}, 2000);
				})
				.catch((error) => {
					setIsLoading(false);
					toast.error("Error submiting event");
				});
		},
	});

	const [eventMissionList, setEventMissionList] = useState(event.eventMissionList);
	const [selectedMission, setSelectedMission] = useState(event.eventMissionList[0]);

	const calculateMaxPlayers = () => {
		if (!eventMissionList || eventMissionList.length === 0) return 0;
		const firstMission = eventMissionList[0];
		let total = 0;
		firstMission.factions.forEach(f => {
			f.groups?.forEach(g => {
				total += g.slots?.length ?? 0;
			});
			if (f.slots && !f.groups) {
				total += f.slots.length;
			}
		});
		return total;
	};

	useEffect(() => {
		const newCount = calculateMaxPlayers();
		if (newCount !== eventDataFormik.values.eventSlotCount) {
			eventDataFormik.setFieldValue("eventSlotCount", newCount);
		}
	}, [eventMissionList]);

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
		if (!values.eventCoverMedia && !event.imageLink) {
			errors["eventCoverMedia"] = "Event cover media required.";
		}
		if (!values.eventStartDate) {
			errors["eventStartDate"] = "Time and date required.";
		}

		return errors;
	}

	function callCloseEvent(reason: string, numberOfParticipants: number) {
		if (isLoading) {
			return;
		}
		axios
			.post("/api/reforger-events/close", {
				eventId: event._id,
				reason,
				numberOfParticipants,
			})
			.then((response) => {
				toast.success("Event closed, returning to the list");
				setTimeout(() => {
					window.open(`/staff/events/list`, "_self");
				}, 2000);
			})
			.catch((error) => {
				setIsLoading(false);
				toast.error("Error closing event");
			});
	}

	useEffect(() => {
		prism.highlightAll();
	}, [currentContentPage]);

	return (
        <CredentialLockLayout session={session} cred={CREDENTIAL.ADMIN}>
            <Head>
				<title>Editing {event.name}</title>
			</Head>
            <div className="max-w-screen-xl px-5 mx-auto mt-24">
				<form onSubmit={eventDataFormik.handleSubmit} className="mb-10">
					<div className="flex flex-row justify-between">
						<div className="prose text-gray-900 dark:text-gray-100">
							<h1 className="text-gray-900 dark:text-white uppercase font-black tracking-tighter">Editing event {event.closeReason && "a closed event"}</h1>
						</div>
						<div className="space-x-2">
							{!event.closeReason && (
								<>
									<button
										type="button"
										className={`btn btn-lg ${isPaused ? 'btn-success' : 'btn-error'}`}
										onClick={() => setIsPaused(!isPaused)}
									>
										{isPaused ? "Resume signups" : "Pause signups"}
									</button>
									<button
										type="button"
										className={"btn btn-lg btn-warning"}
										onClick={() => {
											if (isLoading) return;
											setCloseModalOpen(true);
										}}
									>
										CLOSE EVENT
									</button>
								</>
							)}

							<button
								className={
									isLoading ? "btn btn-lg btn-primary loading" : "btn btn-lg btn-primary"
								}
								type="submit"
							>
								{isLoading ? "UPDATING EVENT..." : "UPDATE EVENT"}
							</button>
						</div>
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
								<input type="file" onChange={displayImage} className="hidden" />
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
				</form>

				<EventEditingCard
					objectURL={objectUrl}
					isVideo={isVideo}
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
            <CloseEventModal
				isOpen={closeModalOpen}
				onCloseEvent={callCloseEvent}
				onClose={() => setCloseModalOpen(false)}
			/>
            <EventDatePickerModal
				initialDate={eventDataFormik.values.eventStartDate}
				onDateSelect={(date) => eventDataFormik.setFieldValue("eventStartDate", date)}
				isOpen={datePickerModalOpen}
				onClose={() => setDatePickerModalOpen(false)}
			/>
        </CredentialLockLayout>
    );
}

export async function getServerSideProps(context) {
	const session = await getSession(context);
	const db = (await MyMongo).db("prod");
	const event = await db.collection("reforger_events").findOne({
		slug: context.params.slug,
	});

	if (event.eventMissionList) {
		event.eventMissionList.forEach(mission => {
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

	return {
		props: { event: JSON.parse(JSON.stringify(event)), session },
	};
}
