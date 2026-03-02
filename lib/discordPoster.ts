import axios from "axios";

const REVIEW_STATE_PENDING = "review_pending";
const REVIEW_STATE_REPROVED = "review_reproved";
const REVIEW_STATE_ACCEPTED = "review_accepted";
const REVIEW_STATE_ACCEPTS_WITH_CAVEATS = "review_accepted_with_caveats";

const BOT_URL = process.env.BOT_URL ?? "http://globalconflicts.net:3001";

export async function postDiscordNewMission(body) {
	const botResponse = await axios.post(`${BOT_URL}/missions/new`, body);
}

export async function postDiscordMissionUpdate(body) {
	const botResponse = await axios.post(`${BOT_URL}/missions/update`, body);
}

export async function postDiscordAuditRequest(body) {
	const botResponse = await axios.post(`${BOT_URL}/missions/request_audit`, body);
}

export async function postDiscordAuditRequestCancel(body) {
	const botResponse = await axios.post(`${BOT_URL}/missions/request_audit_cancel`, body);
}

export async function postDiscordAuditSubmit(body) {
	const botResponse = await axios.post(`${BOT_URL}/missions/audit_submited`, body);
}

export async function postNewMissionHistory(body) {
	const botResponse = await axios.post(`${BOT_URL}/missions/new_history`, body);
}

export async function postFirstvoteForAMission(body) {
	const botResponse = await axios.post(`${BOT_URL}/missions/first_vote`, body);
}

export async function postNewReview(body) {
	const botResponse = await axios.post(`${BOT_URL}/missions/review`, body);
}

export async function postNewBugReport(body) {
	const botResponse = await axios.post(`${BOT_URL}/missions/bugreport`, body);
}

export async function postNewAAR(body) {
	const botResponse = await axios.post(`${BOT_URL}/missions/aar`, body);
}

export async function postNewMedia(body) {
	const botResponse = await axios.post(`${BOT_URL}/missions/media_posted`, body);
}

export async function postNewYoutubeVideoToVerify(body) {
	const botResponse = await axios.post(`${BOT_URL}/missions/youtube_video_uploaded`, body);
}

// ─── Reforger live-session bot helpers ───────────────────────────────────────

/**
 * Tell the bot to update config.json with the new scenarioId and restart
 * the main Reforger server.
 * missionString is the human-readable label e.g. "COOP (16-30) Devils Drive".
 * The bot writes it to mission_context.json so start.ps1 can pass it to the
 * mock server's load signal during local development.
 */
export async function callBotSetScenario(scenarioId: string, missionString: string): Promise<void> {
	await axios.post(
		`${BOT_URL}/server/set-scenario`,
		{ scenarioId, missionString },
		{ timeout: 15000 }
	);
}

/**
 * Tell the bot to post a Discord message (creating the thread if needed).
 * Returns { messageId, threadId }.
 */
export async function callBotPostMessage(body: {
	channelId: string;
	threadName: string;
	threadId: string | null;
	embed: { description: string; color: string; footer?: string };
}): Promise<{ messageId: string; threadId: string }> {
	const response = await axios.post(`${BOT_URL}/server/post-discord-message`, body, {
		timeout: 15000,
	});
	return response.data;
}

/**
 * Tell the bot to delete a specific message from a thread.
 */
export async function callBotDeleteMessage(body: {
	threadId: string;
	messageId: string;
}): Promise<void> {
	await axios.post(`${BOT_URL}/server/delete-message`, body, { timeout: 15000 });
}

/**
 * Tell the bot to post an embed directly into an existing thread (e.g. for AAR posts).
 */
export async function callBotPostToThread(body: {
	threadId: string;
	embed: { description: string; color: string; footer?: string };
}): Promise<{ messageId: string }> {
	const response = await axios.post(`${BOT_URL}/server/post-to-thread`, body, { timeout: 15000 });
	return response.data;
}

/**
 * Tell the bot to delete an entire forum thread.
 * The bot checks whether the thread contains more than 2 non-bot messages.
 * Returns { deleted: true } on success or { deleted: false, reason, messageCount } if refused.
 */
export async function callBotDeleteThread(body: {
	threadId: string;
}): Promise<{ deleted: boolean; reason?: string; messageCount?: number }> {
	const response = await axios.post(`${BOT_URL}/server/delete-thread`, body, { timeout: 15000 });
	return response.data;
}

/**
 * Tell the bot to edit an existing Discord message.
 * When addReactions is true (outcome is being set), the bot will delete the original
 * message and post a new one so Discord notifies channel members — returns new messageId.
 * When addReactions is false, just edits in-place (no notification needed).
 */
export async function callBotEditMessage(body: {
	messageId: string;
	threadId: string;
	embed: { description: string; color: string; footer?: string };
	addReactions?: boolean;
	uniqueName?: string;
	historyEntryId?: string;
}): Promise<{ newMessageId?: string }> {
	const response = await axios.post(`${BOT_URL}/server/edit-discord-message`, body, { timeout: 15000 });
	return response.data;
}
