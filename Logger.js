class Logger {
	logId(logLevel) {
		if ((logLevel & this.logLevelsEnabled) == 0) return "";

		let logLevelName = "";

		if (logLevel == Logger.LOG_LEVEL_DEBUG) {
			logLevelName = "DEBUG";
		} else if (logLevel == Logger.LOG_LEVEL_INFO) {
			logLevelName = "INFO";
		} else if (logLevel == Logger.LOG_LEVEL_TRACE) {
			logLevelName = "TRACE";
		} else if (logLevel == Logger.LOG_LEVEL_WARNING) {
			logLevelName = "WARNING";
		} else if (logLevel == Logger.LOG_LEVEL_ERROR) {
			logLevelName = "ERROR";
		}

		return logLevelName;
	}

	log(logLevel, header, text, obj) {

	}

	constructor(logLevelsEnabled) {
		this.logLevelsEnabled = logLevelsEnabled | Logger.LOG_LEVEL_INFO;
	}

}

Logger.LOG_LEVEL_ERROR   = 0x00000001;
Logger.LOG_LEVEL_WARNING = 0x00000002 | 0x00000001;
Logger.LOG_LEVEL_INFO    = 0x00000004 | 0x00000002 | 0x00000001;
Logger.LOG_LEVEL_TRACE   = 0x00000008 | 0x00000004 | 0x00000002 | 0x00000001;
Logger.LOG_LEVEL_DEBUG   = 0x0000000A | 0x00000008 | 0x00000004 | 0x00000002 | 0x00000001;

export {Logger};
