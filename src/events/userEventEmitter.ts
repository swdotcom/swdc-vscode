const EventEmitter = require('events')
export const userEventEmitter = new EventEmitter();

import { setEndOfDayNotification } from "../notifications/endOfDay";

userEventEmitter.on('user_object_updated', () => {
	setEndOfDayNotification();
});
