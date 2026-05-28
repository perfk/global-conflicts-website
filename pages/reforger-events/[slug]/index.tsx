// V2.1 - Forced Recompile
import Head from "next/head";
import Countdown from "react-countdown";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import MyMongo from "../../../lib/mongodb";
import clientPromise from "../../../lib/mongodb";
import SlotSelectionModal from "../../../components/modals/reforger_slot_selection_modal";
import axios from "axios";
import { useSession } from "next-auth/react";
import { toast } from "react-toastify";
import { QuestionMarkCircleIcon } from "@heroicons/react/outline";
import AboutSignUpModal from "../../../components/modals/about_sign_ups_modal";
import NavBarItem from "../../../components/navbar_item";
import EventCard from "../../../components/reforger_event_list_card";
import {
    ExclamationCircleIcon,
    InformationCircleIcon,
} from "@heroicons/react/outline";
import EventRosterModal from "../../../components/modals/event_roster_modal";
import useSWR from "swr";
import fetcher from "../../../lib/fetcher";
import { generateMarkdown } from "../../../lib/markdownToHtml";
import prism from "prismjs";
require("prismjs/components/prism-sqf");
import "prismjs/themes/prism-okaidia.css";
import { GetStaticPropsContext } from 'next/types';
import { callCantMakeIt, callReserveSlot, callSignUp, hasReservableSlots, getFirstMissionSignupCount } from '../../../lib/reforger_eventhelpers';
import ReforgerEventRosterInline from "../../../components/reforger_event_roster_inline";
const Completionist = () => (
    <div className="my-10 prose">
        <h1>It has begun!</h1>
    </div>
);

// Renderer callback with condition
const renderer = ({ days, hours, minutes, seconds, completed }) => {
    if (completed) {
        // Render a complete state
        return <Completionist />;
    } else {
        // Render a countdown
        var daysStyle = { "--value": days } as React.CSSProperties;
        var hoursStyle = { "--value": hours } as React.CSSProperties;
        var minutesStyle = { "--value": minutes } as React.CSSProperties;
        var secondsStyle = { "--value": seconds } as React.CSSProperties;
        return (
            <div className="flex flex-col md:flex-row items-center gap-5 md:gap-10">
                <div className="prose text-gray-900 dark:text-gray-100">
                    <h1 className="text-gray-900 dark:text-white m-0">Starts in:</h1>
                </div>
                <div className="flex items-center prose grid-flow-col gap-5 text-sm text-center auto-cols-max">
                    <div className="flex flex-col">
                        <span className="font-mono text-2xl countdown">
                            <span style={daysStyle}></span>
                        </span>
                        days
                    </div>
                    <div className="flex flex-col">
                        <span className="font-mono text-2xl countdown">
                            <span style={hoursStyle}></span>
                        </span>
                        hours
                    </div>
                    <div className="flex flex-col">
                        <span className="font-mono text-2xl countdown">
                            <span style={minutesStyle}></span>
                        </span>
                        min
                    </div>
                    <div className="flex flex-col">
                        <span className="font-mono text-2xl countdown">
                            <span style={secondsStyle}></span>
                        </span>
                        sec
                    </div>
                </div>
            </div>
        );
    }
};
export default function EventHome({ event }) {
    const [currentContentPage, setCurrentContentPage] = useState(
        event.contentPages[0]
    );
    const { data: session, status } = useSession();
    const reloadSession = () => {
        const event = new Event("visibilitychange");
        document.dispatchEvent(event);
    };

    const {
        data: roster,
        isValidating,
        mutate: mutadeRoster,
    } = useSWR(`/api/reforger-events/roster?eventId=${event._id}`, fetcher, {
        revalidateOnFocus: false,
    });

    const signupCount = getFirstMissionSignupCount(roster);

    useEffect(() => {
        prism.highlightAll();
    }, [currentContentPage]);

    return <>
        <Head>
            <title>{event.name}</title>

            <meta name="description" content={event.description} key="description" />
            <meta
                property="og:description"
                content={event.description}
                key="og:description"
            />
            <meta
                name="twitter:description"
                content={event.description}
                key="twitter:description"
            />
            <meta
                property="og:url"
                content={`https://globalconflicts.net/events/${event.name}`}
                key="og:url"
            />
            <meta
                property="twitter:url"
                content={`https:///globalconflicts.net/events/${event.name}`}
                key="twitter:url"
            />

            <meta property="og:title" content={event.name} key="og:title" />

            <meta name="twitter:title" content={event.name} key="twitter:title" />

            <meta
                name="twitter:image"
                content={event.imageSocialLink}
                key="twitter:image"
            />
            <meta
                property="og:image"
                content={event.imageSocialLink}
                key="og:image"
            />
        </Head>

        <div className="dark min-h-screen">
            <div className="flex flex-col max-w-screen-lg px-2 mx-auto mb-10 xl:max-w-screen-xl ">
                {event.completed ? (
                    <div className="my-10 prose">
                        <h1>Event concluded</h1>
                    </div>
                ) : (
                    <div className="flex flex-col md:flex-row justify-between items-center mt-16 mb-10 gap-6">
                        <div className="flex flex-row">
                            {event.closeReason == "CANCELED" && (
                                <div className="alert alert-error">
                                    <div className="items-center flex-1">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            className="w-6 h-6 mx-2 stroke-current"
                                        >
                                            <ExclamationCircleIcon></ExclamationCircleIcon>
                                        </svg>
                                        <h2>
                                            This event has been canceled. It is not being listed anymore and you
                                            can only access it via a direct link.
                                        </h2>
                                    </div>
                                </div>
                            )}
                            {event.closeReason == "COMPLETED" && (
                                <div className="alert alert-info">
                                    <div className="items-center flex-1">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            className="w-6 h-6 mx-2 stroke-current"
                                        >
                                            <InformationCircleIcon></InformationCircleIcon>
                                        </svg>
                                        <h2>
                                            This event has been completed. You can not sign up for it anymore.
                                        </h2>
                                    </div>
                                </div>
                            )}
                            {!event.closeReason && (
                                <Countdown date={new Date(event.when)} renderer={renderer}></Countdown>
                            )}
                        </div>

                        <div className="flex">
                            <Link
                                href="/guides/events#signup-and-slotting-procedure"
                                passHref
                                className="btn btn-md btn-outline-standard "
                                target="_blank"
                                legacyBehavior>
                                <span className="dark:text-white flex items-center gap-2">
                                    How it works <QuestionMarkCircleIcon height={25}></QuestionMarkCircleIcon>
                                </span>
                            </Link>
                        </div>
                    </div>
                )}
                <EventCard
                    event={event}
                    aspectRatio={"16/9"}
                    contentHeight={"100%"}
                    isViewOnly={true}
                    overrideSignupCount={signupCount}
                ></EventCard>

                {!event.closeReason && (
                    <ReforgerEventRosterInline 
                        event={event} 
                        roster={roster} 
                        session={session} 
                        onUpdate={() => mutadeRoster()} 
                    />
                )}
            </div>
            <div className="max-w-screen-lg mx-auto xl:max-w-screen-xl mb-44">
                <div className="px-2">
                    <div className="prose text-gray-900 dark:text-gray-100">
                        <h1 className="text-gray-900 dark:text-white">Event Details:</h1>
                    </div>
                    <div className="flex flex-col md:flex-row">
                        <aside className="relative flex-shrink w-full h-full px-4 py-6 overflow-y-auto max-w-none md:max-w-14rem">
                            <nav>
                                {event.contentPages.map((contentPage) => (
                                    <ul key={contentPage["title"]} className="">
                                        <NavBarItem
                                            item={contentPage}
                                            isSelected={contentPage.title == currentContentPage.title}
                                            onClick={(child) => {
                                                setCurrentContentPage(contentPage);
                                            }}
                                        ></NavBarItem>
                                    </ul>
                                ))}
                            </nav>
                        </aside>
                        <main className="flex-1 flex-grow max-w-full prose min-w-300">
                            <kbd className="hidden kbd"></kbd>
                            <div
                                dangerouslySetInnerHTML={{
                                    __html: currentContentPage.parsedMarkdownContent,
                                }}
                            ></div>
                        </main>
                    </div>
                </div>
            </div>
        </div>
    </>;
}

export async function getStaticProps(context: GetStaticPropsContext) {
    const { params } = context;
    const slug = params?.slug;

    const event = await (await MyMongo).db("prod").collection("reforger_events").findOne({ slug });

    if (!event) {
        return {
            notFound: true,
        };
    }

    if (event.contentPages) {
        await Promise.all(event.contentPages.map(async (contentPage) => {
            if (contentPage.markdownContent) {
                contentPage.parsedMarkdownContent = await generateMarkdown(
                    contentPage.markdownContent,
                    false
                );
            }
        }));
    }

    if (event.eventMissionList) {
        event.eventMissionList.forEach(mission => {
            mission._id = mission._id?.toString();
            mission.factions?.forEach(faction => {
                faction._id = faction._id?.toString();
                faction.groups?.forEach(group => {
                    group._id = group._id?.toString();
                    group.slots?.forEach(slot => {
                        slot._id = slot._id?.toString();
                    });
                });
                faction.slots?.forEach(slot => {
                    slot._id = slot._id?.toString();
                });
            });
        });
    }

    return {
        props: {
            event: {
                ...event,
                _id: event._id.toString(),
                signups: event.signups || [], // Ensure signups exists for length check
            },
        },
        revalidate: true,
    };
}

export async function getStaticPaths() {
    const client = await clientPromise;
    const db = client.db();
  
    const events = await db
      .collection("reforger_events")
      .find({}, { projection: { slug: 1 } })
      .toArray();
  
    const paths = events.map((event) => ({
      params: { slug: event.slug },
    }));
  
    return {
      paths,
      fallback: 'blocking',
    };
  }
