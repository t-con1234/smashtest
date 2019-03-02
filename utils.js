/**
 * @return {String} str but without leading whitespace and quotes ' or ", returns str if there are no quotes
 */
exports.stripQuotes = function(str) {
    if(exports.hasQuotes(str)) {
        return str.trim().replace(/^'|^"|'$|"$/g, '');
    }
    else {
        return str;
    }
}

/**
 * @return {Boolean} true if str is in 'quotes' or "quotes", false otherwise
 */
exports.hasQuotes = function(str) {
    return str.trim().match(/(^'|^").*('$|"$)/g, '') != null;
}