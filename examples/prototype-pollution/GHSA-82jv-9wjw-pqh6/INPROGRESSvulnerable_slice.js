//util.js
function traverseAndCreate(node, segments) {
    var len = segments.length;
    if (!len)
        return node;
    for (var i = 0; i < len; i++) {
        var segment = segments[i];
        node = node[segment] || (node[segment] = {});
    }
    return node;
}

//templates.js
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });

exports.AsProperty = void 0;

var serializeObject;
if (typeof require === 'function') {
    serializeObject = require('serialize-object');
}

// namespace these are exported under; used when serializing views
var NAMESPACE = 'templates';

var MarkupHook = /** @class */ (function () {
    function MarkupHook() {
        this.module = NAMESPACE;
    }
    return MarkupHook;
}());

var AsPropertyBase = /** @class */ (function (_super) {
    __extends(AsPropertyBase, _super);
    function AsPropertyBase(segments) {
        var _this = _super.call(this) || this;
        _this.segments = segments;
        _this.lastSegment = segments.pop();
        return _this;
    }
    AsPropertyBase.prototype.serialize = function () {
        var segments = this.segments.concat(this.lastSegment);
        return serializeObject.instance(this, segments);
    };
    AsPropertyBase.prototype.emit = function (context, target) {
        var node = (0, traverseAndCreate)(context.controller, this.segments);
        node[this.lastSegment] = target;
        this.addListeners(target, node, this.lastSegment);
    };
    AsPropertyBase.prototype.addListeners = function (target, object, key) {
        this.addDestroyListener(target, function asPropertyDestroy() {
            // memoize initial reference so we dont destroy
            // property that has been replaced with a different reference
            var intialRef = object[key];
            process.nextTick(function deleteProperty() {
                if (intialRef !== object[key]) {
                    return;
                }
                delete object[key];
            });
        });
    };
    return AsPropertyBase;
}(MarkupHook));
var AsProperty = /** @class */ (function (_super) {
    __extends(AsProperty, _super);
    function AsProperty() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.type = 'AsProperty';
        _this.addDestroyListener = elementAddDestroyListener;
        return _this;
    }
    return AsProperty;
}(AsPropertyBase));

exports.AsProperty = AsProperty;


