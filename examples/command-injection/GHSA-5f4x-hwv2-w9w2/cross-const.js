"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HTTP_MESSAGES = exports.HTTP_SERVICE_UNAVAILABLE = exports.HTTP_SERVER_ERROR = exports.HTTP_TOO_MANY_REQUESTS = exports.HTTP_FAILED_DEPENDENCY = exports.HTTP_FOOL = exports.HTTP_RANGE_NOT_SATISFIABLE = exports.HTTP_PAYLOAD_TOO_LARGE = exports.HTTP_PRECONDITION_FAILED = exports.HTTP_CONFLICT = exports.HTTP_NOT_ACCEPTABLE = exports.HTTP_METHOD_NOT_ALLOWED = exports.HTTP_NOT_FOUND = exports.HTTP_FORBIDDEN = exports.HTTP_UNAUTHORIZED = exports.HTTP_BAD_REQUEST = exports.HTTP_NOT_MODIFIED = exports.HTTP_TEMPORARY_REDIRECT = exports.HTTP_MOVED_PERMANENTLY = exports.HTTP_PARTIAL_CONTENT = exports.HTTP_NO_CONTENT = exports.HTTP_OK = exports.NBSP = exports.PORT_DISABLED = exports.PLUGINS_PUB_URI = exports.API_URI = exports.ADMIN_URI = exports.FRONTEND_URI = exports.SPECIAL_URI = void 0;
exports.SPECIAL_URI = '/~/';
exports.FRONTEND_URI = exports.SPECIAL_URI + 'frontend/';
exports.ADMIN_URI = exports.SPECIAL_URI + 'admin/';
exports.API_URI = exports.SPECIAL_URI + 'api/';
exports.PLUGINS_PUB_URI = exports.SPECIAL_URI + 'plugins/';
exports.PORT_DISABLED = -1;
exports.NBSP = '\xA0';
exports.HTTP_OK = 200;
exports.HTTP_NO_CONTENT = 204;
exports.HTTP_PARTIAL_CONTENT = 206;
exports.HTTP_MOVED_PERMANENTLY = 301;
exports.HTTP_TEMPORARY_REDIRECT = 302;
exports.HTTP_NOT_MODIFIED = 304;
exports.HTTP_BAD_REQUEST = 400;
exports.HTTP_UNAUTHORIZED = 401;
exports.HTTP_FORBIDDEN = 403;
exports.HTTP_NOT_FOUND = 404;
exports.HTTP_METHOD_NOT_ALLOWED = 405;
exports.HTTP_NOT_ACCEPTABLE = 406;
exports.HTTP_CONFLICT = 409;
exports.HTTP_PRECONDITION_FAILED = 412;
exports.HTTP_PAYLOAD_TOO_LARGE = 413;
exports.HTTP_RANGE_NOT_SATISFIABLE = 416;
exports.HTTP_FOOL = 418;
exports.HTTP_FAILED_DEPENDENCY = 424;
exports.HTTP_TOO_MANY_REQUESTS = 429;
exports.HTTP_SERVER_ERROR = 500;
exports.HTTP_SERVICE_UNAVAILABLE = 503;
exports.HTTP_MESSAGES = {
    [exports.HTTP_UNAUTHORIZED]: "Unauthorized",
    [exports.HTTP_FORBIDDEN]: "Forbidden",
    [exports.HTTP_NOT_FOUND]: "Not found",
    [exports.HTTP_SERVER_ERROR]: "Server error",
    [exports.HTTP_TOO_MANY_REQUESTS]: "Too many requests",
};
