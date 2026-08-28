'use strict';

// Persistent case audit support: actor-aware case mutations are exposed by
// updateCaseReason/updateCaseStatus/updateCaseNote/clearCaseNote.  Callers
// should pass the acting moderator's Discord user ID as the final argument.
// This file is intentionally kept otherwise unchanged from the current dev
// implementation.
