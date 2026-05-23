"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsRepository = void 0;
const db_utils_1 = require("../utils/db-utils");
exports.NotificationsRepository = {
    getDismissedByShow: (db, showId) => (0, db_utils_1.dbAll)(db, 'SELECT episodeNumber FROM dismissed_notifications WHERE showId = ?', [showId]),
    getDiscoveredByShow: (db, showId) => (0, db_utils_1.dbAll)(db, 'SELECT episodeNumber FROM discovered_notifications WHERE showId = ?', [showId]),
    addDiscovered: (db, showId, episodeNumber) => (0, db_utils_1.dbRun)(db, 'INSERT OR IGNORE INTO discovered_notifications (showId, episodeNumber) VALUES (?, ?)', [showId, episodeNumber]),
    addDismissed: (db, showId, episodeNumber) => (0, db_utils_1.dbRun)(db, 'INSERT OR IGNORE INTO dismissed_notifications (showId, episodeNumber) VALUES (?, ?)', [showId, episodeNumber]),
    dismissFromDiscovered: (db, showId) => {
        if (showId) {
            return (0, db_utils_1.dbRun)(db, 'INSERT OR IGNORE INTO dismissed_notifications (showId, episodeNumber) SELECT showId, episodeNumber FROM discovered_notifications WHERE showId = ?', [showId]);
        }
        else {
            return (0, db_utils_1.dbRun)(db, 'INSERT OR IGNORE INTO dismissed_notifications (showId, episodeNumber) SELECT showId, episodeNumber FROM discovered_notifications');
        }
    },
    deleteByShow: (db, showId) => Promise.all([
        (0, db_utils_1.dbRun)(db, 'DELETE FROM dismissed_notifications WHERE showId = ?', [showId]),
        (0, db_utils_1.dbRun)(db, 'DELETE FROM discovered_notifications WHERE showId = ?', [showId]),
    ]),
    deleteSpecificDismissed: (db, showId, episodeNumber) => (0, db_utils_1.dbRun)(db, 'DELETE FROM dismissed_notifications WHERE showId = ? AND episodeNumber = ?', [
        showId,
        episodeNumber,
    ]),
    cleanupWatchedNotifications: (db) => Promise.all([
        (0, db_utils_1.dbRun)(db, 'DELETE FROM dismissed_notifications WHERE EXISTS (SELECT 1 FROM watched_episodes we WHERE we.showId = dismissed_notifications.showId AND we.episodeNumber = dismissed_notifications.episodeNumber)'),
        (0, db_utils_1.dbRun)(db, 'DELETE FROM discovered_notifications WHERE EXISTS (SELECT 1 FROM watched_episodes we WHERE we.showId = discovered_notifications.showId AND we.episodeNumber = discovered_notifications.episodeNumber)'),
    ]),
};
