import { TrashIcon, LockClosedIcon, LockOpenIcon, DuplicateIcon, ArrowUpIcon, ArrowDownIcon, PencilIcon } from "@heroicons/react/outline";
import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import EventNavBarFactionItem from "./event_navbar_faction_item";
import AddIcon from "./icons/add";

import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import React from "react";
import { v4 as uuidv4 } from 'uuid';
import axios from "axios";

export default function ReforgerEventsSlotsCreation({ 
    eventMissionList, 
    setEventMissionList,
    selectedMission,
    setSelectedMission
}) {

    const [newFactionName, setNewFactionName] = useState("");
    const [templates, setTemplates] = useState([]);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [isRenamingMission, setIsRenamingMission] = useState(false);

    useEffect(() => {
        // Fetch templates
        axios.get("/api/reforger-events/templates").then(res => setTemplates(res.data));
    }, []);

    const reorder = (list, startIndex, endIndex) => {
        const result = Array.from(list);
        const [removed] = result.splice(startIndex, 1);
        result.splice(endIndex, 0, removed);
        return result;
    };

    const saveAsTemplate = () => {
        const name = prompt("Enter template name:");
        if (!name) return;
        const currentFaction = selectedMission.factions.find(f => f._id === selectedMission.selectedFactionId) || selectedMission.factions[0];
        axios.post("/api/reforger-events/templates", {
            name,
            factions: currentFaction ? [currentFaction] : selectedMission.factions
        }).then(() => toast.success("Template saved!"));
    };

    const loadTemplate = (template) => {
        const mission = eventMissionList.find(m => m._id === selectedMission._id);
        if (mission) {
            mission.factions = JSON.parse(JSON.stringify(template.factions)).map(f => ({
                ...f, 
                _id: uuidv4(), 
                groups: f.groups.map(g => ({
                    ...g, 
                    _id: uuidv4(), 
                    slots: g.slots.map(s => ({...s, _id: uuidv4()}))
                }))
            }));
            setEventMissionList([...eventMissionList]);
        }
        setShowTemplateModal(false);
        toast.success("Template loaded!");
    };

    const updateTemplate = (template) => {
        if (!confirm(`Update template "${template.name}" with current setup?`)) return;
        axios.put("/api/reforger-events/templates", {
            _id: template._id,
            factions: selectedMission.factions
        }).then(() => {
            toast.success("Template updated!");
            axios.get("/api/reforger-events/templates").then(res => setTemplates(res.data));
        });
    };

    const deleteTemplate = (id) => {
        if (!confirm("Delete this template?")) return;
        axios.delete(`/api/reforger-events/templates?id=${id}`).then(() => {
            toast.success("Template deleted!");
            setTemplates(templates.filter(t => t._id !== id));
        });
    };

    const addMission = () => {
        const name = prompt("Enter mission name:");
        if (!name) return;
        const newMission = {
            _id: uuidv4(),
            name: name,
            factions: [{
                _id: uuidv4(),
                name: "Default Faction",
                groups: [],
                slots: []
            }]
        };
        setEventMissionList([...eventMissionList, newMission]);
        setSelectedMission(newMission);
    };

    const deleteMission = (id) => {
        if (eventMissionList.length <= 1) return toast.error("Event must have at least one mission");
        if (!confirm("Delete this entire mission and all its factions/slots?")) return;
        const newList = eventMissionList.filter(m => m._id !== id);
        setEventMissionList(newList);
        setSelectedMission(newList[0]);
    };

    const addGroup = () => {
        const name = prompt("Enter group name (e.g. Headquarters, 1st Squad):");
        if (!name) return;
        const mission = eventMissionList.find(m => m._id === selectedMission._id);
        const faction = mission.factions.find(f => f._id === selectedMission.selectedFactionId) || mission.factions[0];
        if (!faction.groups) faction.groups = [];
        faction.groups.push({
            _id: uuidv4(),
            name: name,
            isLocked: false,
            lockMessage: "",
            slots: []
        });
        setEventMissionList([...eventMissionList]);
    };

    const removeGroup = (groupId) => {
        const mission = eventMissionList.find(m => m._id === selectedMission._id);
        const faction = mission.factions.find(f => f._id === selectedMission.selectedFactionId) || mission.factions[0];
        faction.groups = faction.groups.filter(g => g._id !== groupId);
        setEventMissionList([...eventMissionList]);
    };

    const duplicateGroup = (group) => {
        const newGroup = JSON.parse(JSON.stringify(group));
        newGroup._id = uuidv4();
        newGroup.name = `${newGroup.name} (Copy)`;
        newGroup.slots.forEach(s => s._id = uuidv4());
        const mission = eventMissionList.find(m => m._id === selectedMission._id);
        const faction = mission.factions.find(f => f._id === selectedMission.selectedFactionId) || mission.factions[0];
        faction.groups.push(newGroup);
        setEventMissionList([...eventMissionList]);
    };

    const addSlotToGroup = (groupId) => {
        const mission = eventMissionList.find(m => m._id === selectedMission._id);
        const faction = mission.factions.find(f => f._id === selectedMission.selectedFactionId) || mission.factions[0];
        const group = faction.groups.find(g => g._id === groupId);
        group.slots.push({
            _id: uuidv4(),
            name: "New Role",
            description: "",
            count: 1,
            difficulty: 1,
            isLocked: false,
            lockMessage: ""
        });
        setEventMissionList([...eventMissionList]);
    };

    const removeSlotFromGroup = (groupId, slotId) => {
        const mission = eventMissionList.find(m => m._id === selectedMission._id);
        const faction = mission.factions.find(f => f._id === selectedMission.selectedFactionId) || mission.factions[0];
        const group = faction.groups.find(g => g._id === groupId);
        group.slots = group.slots.filter(s => s._id !== slotId);
        setEventMissionList([...eventMissionList]);
    };

    const onDragEnd = (result) => {
        if (!result.destination) return;
        const { source, destination, type } = result;

        if (type === "MISSION") {
            setEventMissionList(reorder(eventMissionList, source.index, destination.index));
            return;
        }

        const mission = eventMissionList.find(m => m._id === selectedMission._id);
        const factionId = selectedMission.selectedFactionId || mission.factions[0]._id;
        const faction = mission.factions.find(f => f._id === factionId);

        if (type === "GROUP") {
            faction.groups = reorder(faction.groups, source.index, destination.index);
        } else if (type === "FACTION") {
            mission.factions = reorder(mission.factions, source.index, destination.index);
        } else {
            const sourceGroup = faction.groups.find(g => g._id === source.droppableId);
            const destGroup = faction.groups.find(g => g._id === destination.droppableId);

            if (source.droppableId === destination.droppableId) {
                sourceGroup.slots = reorder(sourceGroup.slots, source.index, destination.index);
            } else {
                const [movedSlot] = sourceGroup.slots.splice(source.index, 1);
                destGroup.slots.splice(destination.index, 0, movedSlot);
            }
        }
        setEventMissionList([...eventMissionList]);
    };

    const currentFaction = selectedMission.factions.find(f => f._id === selectedMission.selectedFactionId) || selectedMission.factions[0];

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-xl overflow-hidden border dark:border-gray-700">
            {/* Mission Selector & Reordering */}
            <div className="bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-700 p-2 flex items-center justify-between">
                <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="missions-list" direction="horizontal" type="MISSION">
                        {(provided) => (
                            <div {...provided.droppableProps} ref={provided.innerRef} className="flex space-x-2">
                                {eventMissionList.map((m, idx) => (
                                    <Draggable key={m._id} draggableId={m._id} index={idx}>
                                        {(provided) => (
                                            <div 
                                                ref={provided.innerRef} 
                                                {...provided.draggableProps} 
                                                {...provided.dragHandleProps}
                                                className={`px-4 py-2 rounded-lg text-sm font-bold cursor-pointer transition-all border flex items-center space-x-2 ${selectedMission._id === m._id ? 'bg-primary text-white border-primary shadow-md scale-105' : 'bg-white dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700 hover:border-primary/50'}`}
                                                onClick={() => setSelectedMission(m)}
                                            >
                                                <DuplicateIcon height={14} className="opacity-50" />
                                                <span>{m.name}</span>
                                            </div>
                                        )}
                                    </Draggable>
                                ))}
                                {provided.placeholder}
                            </div>
                        )}
                    </Droppable>
                </DragDropContext>
                <button className="btn btn-primary btn-sm gap-2" onClick={addMission}>
                    <AddIcon />
                    Add Mission
                </button>
            </div>

            <div className="flex flex-row flex-grow overflow-hidden bg-white dark:bg-gray-800">
                {/* Left Faction Sidebar */}
                <aside className="w-64 bg-white dark:bg-gray-800 border-r dark:border-gray-700 p-4 flex flex-col overflow-x-hidden">
                    <div className="mb-6 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border dark:border-gray-700">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-[10px] uppercase font-black tracking-widest text-gray-500">Mission Name</h3>
                            <div className="flex space-x-1">
                                <button title="Rename Mission" className="btn btn-ghost btn-xs px-1" onClick={() => setIsRenamingMission(!isRenamingMission)}>
                                    <PencilIcon height={12} />
                                </button>
                                <button title="Delete Mission" className="btn btn-ghost btn-xs px-1 text-error" onClick={() => deleteMission(selectedMission._id)}>
                                    <TrashIcon height={12} />
                                </button>
                            </div>
                        </div>
                        {isRenamingMission ? (
                            <input 
                                className="input input-xs input-bordered w-full bg-white dark:bg-gray-800 font-bold"
                                value={selectedMission.name}
                                onChange={(e) => {
                                    selectedMission.name = e.target.value;
                                    setEventMissionList([...eventMissionList]);
                                    setSelectedMission({...selectedMission});
                                }}
                                onBlur={() => setIsRenamingMission(false)}
                                onKeyDown={(e) => e.key === 'Enter' && setIsRenamingMission(false)}
                                autoFocus
                            />
                        ) : (
                            <div className="text-sm font-black text-gray-900 dark:text-white truncate" title={selectedMission.name}>{selectedMission.name}</div>
                        )}
                    </div>

                    <div className="flex-grow overflow-y-auto pr-1">
                        <div className="flex items-center justify-between mb-4 px-1">
                            <h3 className="text-[10px] uppercase font-black tracking-widest text-gray-500">Factions</h3>
                        </div>
                        
                        <DragDropContext onDragEnd={onDragEnd}>
                            <Droppable droppableId="factions-list" type="FACTION">
                                {(provided) => (
                                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-1">
                                        {selectedMission.factions.map((f, idx) => (
                                            <Draggable key={f._id} draggableId={f._id} index={idx}>
                                                {(provided) => (
                                                    <div 
                                                        ref={provided.innerRef} 
                                                        {...provided.draggableProps} 
                                                        {...provided.dragHandleProps}
                                                        className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border border-transparent ${selectedMission.selectedFactionId === f._id ? 'bg-primary/10 text-primary border-primary/20' : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}
                                                        onClick={() => setSelectedMission({...selectedMission, selectedFactionId: f._id})}
                                                    >
                                                        <div className="flex items-center space-x-2 flex-grow overflow-hidden">
                                                            <div className="text-gray-400 group-hover:text-primary flex-shrink-0">
                                                                <DuplicateIcon height={14} />
                                                            </div>
                                                            <input 
                                                                className="bg-transparent font-bold text-xs focus:outline-none flex-grow cursor-text hover:bg-black/5 dark:hover:bg-white/5 px-1 rounded transition-colors truncate"
                                                                value={f.name}
                                                                onChange={(e) => {
                                                                    f.name = e.target.value;
                                                                    setEventMissionList([...eventMissionList]);
                                                                }}
                                                            />
                                                        </div>
                                                        <button 
                                                            className="opacity-0 group-hover:opacity-100 text-error hover:scale-110 transition-all ml-1 flex-shrink-0"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (selectedMission.factions.length <= 1) return toast.error("Mission must have one faction");
                                                                selectedMission.factions = selectedMission.factions.filter(fac => fac._id !== f._id);
                                                                setEventMissionList([...eventMissionList]);
                                                                if (selectedMission.selectedFactionId === f._id) {
                                                                    setSelectedMission({...selectedMission, selectedFactionId: selectedMission.factions[0]._id});
                                                                }
                                                            }}
                                                        >
                                                            <TrashIcon height={12} />
                                                        </button>
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        </DragDropContext>

                        <div className="mt-4 px-1">
                            <div className="flex space-x-1">
                                <input 
                                    placeholder="New Faction..." 
                                    className="input input-xs input-bordered flex-grow bg-white dark:bg-gray-700"
                                    value={newFactionName}
                                    onChange={(e) => setNewFactionName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && newFactionName) {
                                            selectedMission.factions.push({ _id: uuidv4(), name: newFactionName, groups: [], slots: [] });
                                            setEventMissionList([...eventMissionList]);
                                            setNewFactionName("");
                                        }
                                    }}
                                />
                                <button className="btn btn-xs btn-primary px-2" onClick={() => {
                                    if (!newFactionName) return;
                                    selectedMission.factions.push({ _id: uuidv4(), name: newFactionName, groups: [], slots: [] });
                                    setEventMissionList([...eventMissionList]);
                                    setNewFactionName("");
                                }}><AddIcon /></button>
                            </div>
                        </div>
                    </div>

                    <div className="pt-6 mt-4 border-t dark:border-gray-700 space-y-2">
                        <button className="btn btn-sm btn-info w-full text-white font-black shadow-lg uppercase tracking-tighter" onClick={() => setShowTemplateModal(true)}>Templates</button>
                        <button className="btn btn-sm btn-success w-full text-white font-black shadow-lg uppercase tracking-tighter" onClick={saveAsTemplate}>Save Template</button>
                    </div>
                </aside>

                {/* Main Content Area: Groups & Slots */}
                <main className="flex-grow p-8 overflow-y-auto bg-white dark:bg-gray-800">
                    <div className="w-full">
                        <div className="flex justify-between items-center mb-8 border-b dark:border-gray-700 pb-4">
                            <div>
                                <h2 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">{currentFaction.name} Roster</h2>
                                <p className="text-gray-500 text-sm">Organize slots into groups and sections</p>
                            </div>
                            <button className="btn btn-primary" onClick={addGroup}>Add Group / Section</button>
                        </div>

                        <DragDropContext onDragEnd={onDragEnd}>
                            <Droppable droppableId="groups-droppable" type="GROUP">
                                {(provided) => (
                                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-6">
                                        {currentFaction.groups?.map((group, gIndex) => (
                                            <Draggable key={group._id} draggableId={group._id} index={gIndex}>
                                                {(provided) => (
                                                    <div ref={provided.innerRef} {...provided.draggableProps} className="w-full bg-gray-50 dark:bg-gray-900/40 rounded-2xl border dark:border-gray-700 shadow-sm overflow-hidden">
                                                        <div className="flex justify-between items-center p-4 bg-gray-100/50 dark:bg-gray-800/50 border-b dark:border-gray-700">
                                                            <div className="flex items-center space-x-3 flex-grow">
                                                                <div {...provided.dragHandleProps} className="cursor-move text-gray-400 hover:text-primary transition-colors">
                                                                    <DuplicateIcon height={20} />
                                                                </div>
                                                                <input 
                                                                    className="bg-transparent font-black text-lg focus:outline-none w-full text-gray-900 dark:text-white pl-[2px]"
                                                                    value={group.name}
                                                                    onChange={(e) => {
                                                                        group.name = e.target.value;
                                                                        setEventMissionList([...eventMissionList]);
                                                                    }}
                                                                />
                                                                <button 
                                                                    onClick={() => { group.isLocked = !group.isLocked; setEventMissionList([...eventMissionList]); }}
                                                                    className={`btn btn-xs btn-ghost text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 ${group.isLocked ? 'bg-error/20 text-error' : ''}`}
                                                                >
                                                                    {group.isLocked ? <LockClosedIcon height={16} /> : <LockOpenIcon height={16} />}
                                                                </button>
                                                            </div>
                                                            <div className="flex items-center space-x-1">
                                                                <button title="Duplicate Group" className="btn btn-ghost btn-sm text-gray-400 hover:text-primary" onClick={() => duplicateGroup(group)}><DuplicateIcon height={18} /></button>
                                                                <button title="Remove Group" className="btn btn-ghost btn-sm text-gray-400 hover:text-error" onClick={() => removeGroup(group._id)}><TrashIcon height={18} /></button>
                                                            </div>
                                                        </div>

                                                        <div className="p-4">
                                                            {group.isLocked && (
                                                                <input 
                                                                    placeholder="Lock message (e.g. Reserved for Leadership)"
                                                                    className="input input-bordered input-xs w-full mb-4 bg-error/5 border-error/20 text-error font-medium"
                                                                    value={group.lockMessage}
                                                                    onChange={(e) => { group.lockMessage = e.target.value; setEventMissionList([...eventMissionList]); }}
                                                                />
                                                            )}

                                                            <Droppable droppableId={group._id} type="SLOT">
                                                                {(provided) => (
                                                                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                                                                        {group.slots.map((slot, sIndex) => (
                                                                            <Draggable key={slot._id} draggableId={slot._id} index={sIndex}>
                                                                                {(provided) => (
                                                                                    <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className="bg-white dark:bg-gray-800 p-3 rounded-xl border dark:border-gray-700 flex items-center space-x-3 shadow-sm hover:shadow-md transition-shadow group/slot">
                                                                                        <div className="flex-grow flex flex-col">
                                                                                            <div className="flex items-center space-x-3">
                                                                                                <input 
                                                                                                    className="bg-transparent font-bold focus:outline-none flex-grow text-gray-900 dark:text-gray-100 pl-[2px]"
                                                                                                    value={slot.name}
                                                                                                    onChange={(e) => { slot.name = e.target.value; setEventMissionList([...eventMissionList]); }}
                                                                                                />
                                                                                                <select 
                                                                                                    className="select select-bordered select-xs font-bold"
                                                                                                    value={slot.difficulty}
                                                                                                    onChange={(e) => { slot.difficulty = parseInt(e.target.value); setEventMissionList([...eventMissionList]); }}
                                                                                                >
                                                                                                    {[1,2,3,4,5].map(d => <option key={d} value={d}>DIFF {d}</option>)}
                                                                                                </select>
                                                                                                <button 
                                                                                                    onClick={() => { slot.isLocked = !slot.isLocked; setEventMissionList([...eventMissionList]); }}
                                                                                                    className={`btn btn-xs btn-ghost text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 ${slot.isLocked ? 'bg-error/20 text-error' : ''}`}
                                                                                                >
                                                                                                    {slot.isLocked ? <LockClosedIcon height={14} /> : <LockOpenIcon height={14} />}
                                                                                                </button>
                                                                                                <button className="btn btn-ghost btn-xs text-gray-400 hover:text-error opacity-0 group-hover/slot:opacity-100 transition-opacity" onClick={() => removeSlotFromGroup(group._id, slot._id)}><TrashIcon height={14} /></button>
                                                                                            </div>
                                                                                            {slot.isLocked && (
                                                                                                <input 
                                                                                                    placeholder="Slot lock message"
                                                                                                    className="input input-bordered input-xs mt-2 bg-error/5 border-error/10 text-error italic"
                                                                                                    value={slot.lockMessage}
                                                                                                    onChange={(e) => { slot.lockMessage = e.target.value; setEventMissionList([...eventMissionList]); }}
                                                                                                />
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </Draggable>
                                                                        ))}
                                                                        {provided.placeholder}
                                                                        <button className="btn btn-ghost btn-sm w-full border-dashed border-2 mt-4 hover:border-primary hover:text-primary transition-all" onClick={() => addSlotToGroup(group._id)}>+ Add New Role</button>
                                                                    </div>
                                                                )}
                                                            </Droppable>
                                                        </div>
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        </DragDropContext>
                    </div>
                </main>
            </div>

            {showTemplateModal && (
                <div className="modal modal-open">
                    <div className="modal-box bg-white dark:bg-gray-800 border dark:border-gray-700">
                        <h3 className="font-bold text-xl mb-6 text-gray-900 dark:text-white border-b dark:border-gray-700 pb-2">Load Template</h3>
                        <div className="py-4 space-y-2 max-h-96 overflow-y-auto">
                            {templates.map(t => (
                                <div key={t._id} className="flex justify-between items-center p-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl border dark:border-gray-700 group transition-all">
                                    <div className="flex-grow cursor-pointer" onClick={() => loadTemplate(t)}>
                                        <span className="font-bold text-gray-900 dark:text-gray-100">{t.name}</span>
                                        <span className="text-xs text-gray-500 block uppercase tracking-widest">{t.factions.length} Faction(s)</span>
                                    </div>
                                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button className="btn btn-xs btn-outline btn-info" onClick={() => updateTemplate(t)}>Update</button>
                                        <button className="btn btn-xs btn-ghost text-error" onClick={() => deleteTemplate(t._id)}><TrashIcon height={16} /></button>
                                    </div>
                                </div>
                            ))}
                            {templates.length === 0 && <p className="text-gray-500 italic text-center py-8">No templates found.</p>}
                        </div>
                        <div className="modal-action">
                            <button className="btn btn-ghost" onClick={() => setShowTemplateModal(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
