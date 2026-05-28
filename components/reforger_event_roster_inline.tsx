import React, { useState, useEffect } from "react";
import { Tab } from "@headlessui/react";
import { LockClosedIcon, UserRemoveIcon, RefreshIcon, UserAddIcon, SearchIcon, UserIcon } from "@heroicons/react/outline";
import { getSlottedCount, getRadioOptionClasses } from "../lib/reforger_eventhelpers";
import classNames from "../lib/classnames";
import axios from "axios";
import { toast } from "react-toastify";
import { CREDENTIAL } from "../middleware/check_auth_perms";
import { hasCredsAny } from "../lib/credsChecker";

export default function ReforgerEventRosterInline({ event, roster, session, onUpdate }) {
    const [selectedMission, setSelectedMission] = useState(event.eventMissionList[0]);
    const [selectedFaction, setSelectedFaction] = useState(selectedMission.factions[0]);
    const isAdmin = hasCredsAny(session, [CREDENTIAL.ADMIN, CREDENTIAL.MISSION_REVIEWER]);
    
    const [showAdminSearch, setShowAdminSearch] = useState(false);
    const [showAdminChoice, setShowAdminChoice] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [allDiscordUsers, setAllDiscordUsers] = useState([]);
    const [foundUsers, setFoundUsers] = useState([]);
    const [targetSlot, setTargetSlot] = useState(null);

    useEffect(() => {
        if (isAdmin) {
            axios.get("/api/discord-users").then(res => setAllDiscordUsers(res.data));
        }
    }, [isAdmin]);

    useEffect(() => {
        if (!searchQuery) {
            setFoundUsers([]);
            return;
        }
        const q = searchQuery.toLowerCase();
        setFoundUsers(allDiscordUsers.filter(u => 
            u.username?.toLowerCase().includes(q) || 
            u.nickname?.toLowerCase().includes(q) || 
            u.displayName?.toLowerCase().includes(q)
        ).slice(0, 10));
    }, [searchQuery, allDiscordUsers]);

    const handleSlotClick = (slot, group, faction, mission) => {
        if (event.isPaused) {
            toast.info("Signups are currently paused for this event.");
            return;
        }
        if ((slot.isLocked || group.isLocked) && !isAdmin) {
            toast.info(slot.lockMessage || group.lockMessage || "This slot is locked.");
            return;
        }

        const mData = roster?.find(m => m._id.toString() === mission._id.toString());
        const fData = mData?.factions?.find(f => f._id.toString() === faction._id.toString());
        
        let sData = null;
        if (fData?.groups) {
            sData = fData.groups.find(g => g._id.toString() === group._id.toString())?.slots?.find(s => s._id.toString() === slot._id.toString());
        } else {
            sData = fData?.slots?.find(s => s._id.toString() === slot._id.toString());
        }

        const players = sData?.players || [];
        const isFull = players.length >= (slot.count ?? 1);

        if (isFull) return;

        setTargetSlot({ mission, faction, group, slot });

        if (isAdmin) {
            setShowAdminChoice(true);
        } else {
            handleSignup(slot, group, faction, mission);
        }
    };

    const handleSignup = (slot, group, faction, mission) => {
        axios.post("/api/reforger-events/reserve", {
            eventId: event._id,
            eventMissionList: event.eventMissionList.map(m => {
                if (m._id === mission._id) {
                    return { ...m, reservedSlot: slot, reservedFactionId: faction._id };
                }
                return m;
            })
        }).then(() => {
            toast.success("Successfully signed up!");
            onUpdate();
            setShowAdminChoice(false);
        }).catch(err => toast.error(err.response?.data?.error || "Failed to sign up"));
    };

    const handleAdminAction = (action, data) => {
        axios.post("/api/reforger-events/admin-action", {
            eventId: event._id,
            action,
            ...data
        }).then(() => {
            toast.success("Admin action successful");
            onUpdate();
            setShowAdminSearch(false);
            setShowAdminChoice(false);
        }).catch(err => toast.error(err.response?.data?.error || "Admin action failed"));
    };

    const searchUsers = () => {
        axios.get(`/api/discord-users?q=${searchQuery}`).then(res => {
            setFoundUsers(res.data.filter(u => u.username.toLowerCase().includes(searchQuery.toLowerCase()) || u.nickname?.toLowerCase().includes(searchQuery.toLowerCase())));
        });
    };

    const getDifficultyColor = (diff) => {
        switch(diff) {
            case 1: return "text-green-500";
            case 2: return "text-green-400";
            case 3: return "text-yellow-500";
            case 4: return "text-orange-500";
            case 5: return "text-red-500";
            default: return "text-gray-500";
        }
    };

    const renderRoster = (mission) => {
        let globalSlotIndex = 0;
        return (
            <Tab.Group>
                <Tab.List className="flex p-1 space-x-1 bg-blue-900/5 dark:bg-gray-800 rounded-xl mb-6">
                    {mission.factions.map((faction) => (
                        <Tab
                            key={faction._id}
                            onClick={() => setSelectedFaction(faction)}
                            className={({ selected }) =>
                                classNames(
                                    "w-full py-2.5 text-sm leading-5 font-medium rounded-lg transition-all outline-none",
                                    selected ? "bg-white dark:bg-gray-700 text-blue-700 dark:text-white shadow" : "text-gray-400 hover:bg-white/[0.12] hover:text-white"
                                )
                            }
                        >
                            {faction.name}
                        </Tab>
                    ))}
                </Tab.List>
                <Tab.Panels>
                    {mission.factions.map((faction) => (
                        <Tab.Panel key={faction._id} className="space-y-6">
                            {faction.groups?.map((group) => (
                                <div key={group._id} className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border dark:border-gray-800">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-lg font-bold flex items-center text-gray-900 dark:text-gray-100">
                                            {group.name}
                                            {group.isLocked && <LockClosedIcon className="h-4 w-4 ml-2 text-error" />}
                                        </h3>
                                        {group.isLocked && <span className="text-xs italic text-error">{group.lockMessage}</span>}
                                    </div>
                                    
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {group.slots.map((slot) => {
                                            globalSlotIndex++;
                                            const displayId = globalSlotIndex.toString().padStart(2, '0');
                                            const mData = roster?.find(m => m._id.toString() === mission._id.toString());
                                            const fData = mData?.factions?.find(f => f._id.toString() === faction._id.toString());
                                            
                                            let sData = null;
                                            if (fData?.groups) {
                                                sData = fData.groups.find(g => g._id.toString() === group._id.toString())?.slots?.find(s => s._id.toString() === slot._id.toString());
                                            } else {
                                                sData = fData?.slots?.find(s => s._id.toString() === slot._id.toString());
                                            }

                                            const players = sData?.players || [];
                                            const isFull = players.length >= (slot.count ?? 1);
                                            const isLocked = slot.isLocked || group.isLocked;

                                            return (
                                                <div 
                                                    key={slot._id}
                                                    className={classNames(
                                                        "p-3 rounded-lg border transition-all cursor-pointer relative",
                                                        isFull ? "bg-gray-100 dark:bg-gray-900/50 border-transparent" : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-primary",
                                                        isLocked ? "border-error/20" : ""
                                                    )}
                                                    onClick={() => handleSlotClick(slot, group, faction, mission)}
                                                >
                                                    <div className="flex justify-between items-start mb-1">
                                                        <div className="flex items-center space-x-2">
                                                            <span className="text-[10px] font-mono text-gray-400 font-bold">#{displayId}</span>
                                                            <span className="font-bold text-sm text-gray-900 dark:text-gray-100">{slot.name}</span>
                                                        </div>
                                                        <div className="flex items-center space-x-1">
                                                            <span className={classNames("text-[10px] font-black bg-gray-100 dark:bg-gray-900/50 px-1.5 py-0.5 rounded border dark:border-gray-700 uppercase", getDifficultyColor(slot.difficulty))}>D{slot.difficulty}</span>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="space-y-1 mt-2">
                                                        {players.map((p, idx) => (
                                                            <div key={idx} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-1 rounded font-bold flex justify-between items-center group/player border dark:border-gray-600">
                                                                <span className="truncate">{p}</span>
                                                                {isAdmin && (
                                                                    <button 
                                                                        onClick={(e) => { e.stopPropagation(); handleAdminAction("remove", { playerName: p, missionId: mission._id, slotId: slot._id }); }}
                                                                        className="hidden group-hover/player:block text-error hover:scale-110"
                                                                    >
                                                                        <UserRemoveIcon className="h-3 w-3" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ))}
                                                        {[...Array(Math.max(0, (slot.count ?? 1) - players.length))].map((_, i) => (
                                                            <div key={`empty-${i}`} className="text-xs text-gray-500 dark:text-gray-400 italic px-2 py-0.5 border border-dashed border-gray-300 dark:border-gray-600 rounded flex justify-between items-center group/empty">
                                                                <span>Vacant</span>
                                                                {isAdmin && (
                                                                    <button 
                                                                        onClick={(e) => { e.stopPropagation(); setTargetSlot({mission, faction, group, slot}); setShowAdminSearch(true); }}
                                                                        className="hidden group-hover/empty:block text-primary hover:scale-110"
                                                                    >
                                                                        <UserAddIcon className="h-3 w-3" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {(slot.isLocked || group.isLocked) && (
                                                        <div className={classNames(
                                                            "absolute inset-0 flex flex-col items-center justify-center rounded-lg backdrop-blur-[1px] p-2 text-center",
                                                            isAdmin ? "bg-black/5" : "bg-black/20"
                                                        )}>
                                                            <LockClosedIcon className="h-5 w-5 text-error opacity-40 mb-1" />
                                                            <span className="text-[10px] font-bold text-error/80 uppercase tracking-tighter leading-none">
                                                                {slot.lockMessage || group.lockMessage || "Locked"}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </Tab.Panel>
                    ))}
                </Tab.Panels>
            </Tab.Group>
        );
    };

    return (
        <div className="mt-12 bg-white dark:bg-gray-800 rounded-3xl p-8 shadow-2xl border dark:border-gray-700">
            <div className="flex flex-col md:flex-row justify-between items-center mb-10 border-b dark:border-gray-700 pb-6 gap-4">
                <div>
                    <h2 className="text-3xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Event Roster</h2>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                        {event.isPaused ? (
                            <span className="text-error font-bold flex items-center">
                                <LockClosedIcon className="h-4 w-4 mr-2" />
                                SIGNUPS ARE CURRENTLY PAUSED
                            </span>
                        ) : "Select your role for each mission"}
                    </p>
                </div>
                
                {event.eventMissionList.length > 1 && (
                    <div className="flex bg-blue-900/5 dark:bg-gray-900 p-1 rounded-xl">
                        {event.eventMissionList.map((m, idx) => (
                            <button
                                key={m._id}
                                onClick={() => setSelectedMission(m)}
                                className={classNames(
                                    "px-4 py-2 rounded-lg text-sm font-bold transition-all",
                                    selectedMission._id === m._id ? "bg-white dark:bg-gray-700 text-blue-700 dark:text-white shadow" : "text-gray-400 hover:text-blue-700 dark:hover:text-white"
                                )}
                            >
                                Mission {idx + 1}: {m.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {renderRoster(selectedMission)}

            {showAdminChoice && (
                <div className="modal modal-open">
                    <div className="modal-box max-w-sm text-center bg-white dark:bg-gray-800 border dark:border-gray-700">
                        <h3 className="font-bold text-xl mb-6 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Slot Assignment</h3>
                        <div className="flex flex-col space-y-3">
                            <button 
                                className="btn btn-primary gap-2"
                                onClick={() => handleSignup(targetSlot.slot, targetSlot.group, targetSlot.faction, targetSlot.mission)}
                            >
                                <UserIcon className="h-5 w-5" />
                                Sign up myself
                            </button>
                            <button 
                                className="btn btn-outline gap-2 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                                onClick={() => { setShowAdminChoice(false); setShowAdminSearch(true); }}
                            >
                                <SearchIcon className="h-5 w-5" />
                                Assign other user
                            </button>
                        </div>
                        <div className="modal-action justify-center">
                            <button className="btn btn-ghost text-gray-500 dark:text-gray-400" onClick={() => setShowAdminChoice(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {showAdminSearch && (
                <div className="modal modal-open">
                    <div className="modal-box max-w-md bg-white dark:bg-gray-800 border dark:border-gray-700">
                        <h3 className="font-bold text-lg mb-4 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Assign Player to {targetSlot?.slot.name}</h3>
                        <div className="flex space-x-2 mb-4">
                            <input 
                                className="input input-bordered flex-grow bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600" 
                                placeholder="Search Discord username..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="max-h-60 overflow-y-auto space-y-1">
                            {foundUsers.map(u => (
                                <div key={u.userId} className="flex justify-between items-center p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer border border-transparent hover:border-primary/50 transition-all text-gray-900 dark:text-white" onClick={() => handleAdminAction("assign", { discordId: u.userId, username: u.username, nickname: u.nickname, missionId: targetSlot.mission._id, factionId: targetSlot.faction._id, slotId: targetSlot.slot._id })}>
                                    <div className="flex items-center space-x-3">
                                        <div className="avatar placeholder">
                                            <div className="bg-neutral-focus text-neutral-content rounded-full w-8">
                                                {u.displayAvatarURL ? <img src={u.displayAvatarURL} /> : <span>{u.username?.substring(0,1)}</span>}
                                            </div>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-sm">{u.nickname || u.username}</span>
                                            {u.nickname && <span className="text-[10px] opacity-50">@{u.username}</span>}
                                        </div>
                                    </div>
                                    <UserAddIcon className="h-4 w-4 text-primary" />
                                </div>
                            ))}
                            {foundUsers.length === 0 && searchQuery && <p className="text-center py-4 text-gray-500 italic">No users found.</p>}
                            {!searchQuery && <p className="text-center py-4 text-gray-400 italic">Type to search Discord users...</p>}
                        </div>
                        <div className="modal-action">
                            <button className="btn btn-ghost text-gray-500 dark:text-gray-400" onClick={() => setShowAdminSearch(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
