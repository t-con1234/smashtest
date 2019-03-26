const clonedeep = require('lodash/clonedeep');
const utils = require('./utils.js');
const Constants = require('./constants.js');

/**
 * Represents a Step within a Tree or StepBlock
 */
class Step {
    constructor() {
        this.indents = -1;                    // number of indents before this step's text, where an indent consists of SPACES_PER_INDENT spaces

        this.parent = null;                   // Step or StepBlock that's the parent of this Step (null if this Step is itself part of a StepBlock)
        this.children = [];                   // Step or StepBlock objects that are children of this Step ([] if this Step is itself part of a StepBlock)

        this.filename = null;                 // filename where this step is from
        this.lineNumber = null;               // line number where this step is from

        /*
        OPTIONAL

        this.line = "";                       // entire text of the step, including spaces at the front, comments, etc.
        this.text = "";                       // text of the command of the step (not including spaces in front, identifiers, comments, etc.)
        this.identifiers = [];                // Array of String, each of which represents an identifier (e.g., ['..', '+', '#something'])
        this.codeBlock = "";                  // if this is a code block step, contains the '{' followed by the code
        this.comment = "";                    // text of the comment at the end of the line (e.g., '// comment here')

        this.isFunctionDeclaration = false;   // true if this step is a * Function Declaration
        this.isFunctionCall = false;          // true if this step is a function call
        this.isTextualStep = false;           // true if this step is textual (-) and not a function call
        this.functionDeclarationInTree = {};  // Step that corresponds to the function declaration, if this step is a function call
        this.functionDeclarationText = "";    // if this step is a function call, this is set to the corresponding function declaration's text

        this.isToDo = false;                  // true if this step has the To Do identifier (-T)
        this.isManual = false;                // true if this step has the manual identifier (-M)
        this.isDebug = false;                 // true if this step has the debug identifier (~)
        this.isOnly = false;                  // true if this step has the only identifier ($)
        this.isNonParallel = false;           // true if this step has the non-parallel identifier (+)
        this.isSequential = false;            // true if this step has the sequential identifier (..)
        this.isExpectedFail = false;          // true if this step has the expected fail indentifier (#)

        this.isBuiltIn = false;               // true if this step is from a built-in file

        this.varsBeingSet = [];               // if this step is in the format {var1}=Step1, {{var2}}=Step2, etc., this array will contain objects {name: "var1", value: "Step1", isLocal: false}, {name: "var2", value: "Step2", isLocal: true} etc.

        this.containingStepBlock = {};        // the StepBlock that contains this Step

        this.originalStepInTree = {};         // when this step is cloned, the clone's originalStepInTree points to the Step from which it was cloned
        this.branchIndents = 0;               // when this step is included in a Branch, this indicates the number of indents to use when printing the Branch out, so as to preserve function calling hierarchies (i.e., steps under a function are indented under that function's call)

        this.isPassed = false;                // true if this step passed after being run
        this.isFailed = false;                // true if this step failed after being run
        this.isSkipped = false;               // true if this step was skipped
        this.isRunning = false;               // true if this step is currently running
        this.asExpected = false;              // true if the passed/failed state is as expected

        this.error = {};                      // if this step failed, this is the Error that was thrown
        this.log = "";                        // string of logs related to this step

        this.elapsed = 0;                     // number of ms it took this step to execute
        */
    }

    /**
     * Generates a clone of this Step, ready to be placed into a Branch
     * Cannot be called if this is a StepBlock
     * @param {Boolean} [noRefs] - If true, the clone will contain no references to outside objects (such as originalStepInTree)
     * @return {Step} A distinct copy of this Step, but with parent, children, containingStepBlock, and functionDeclarationInTree deleted, and originalStepInTree set
     */
    cloneForBranch(noRefs) {
        // We don't want the clone to walk the tree into other Step objects, such as this.parent
        // Therefore, temporarily remove references to other Steps
        var originalParent = this.parent;
        delete this.parent;

        var originalChildren = this.children;
        delete this.children;

        var originalFunctionDeclarationInTree = this.functionDeclarationInTree;
        delete this.functionDeclarationInTree; // delete because this variable is optional and is undefined by default

        var originalContainingStepBlock = this.containingStepBlock;
        delete this.containingStepBlock; // delete because this variable is optional and is undefined by default

        var originalOriginalStepInTree = this.originalStepInTree;
        delete this.originalStepInTree;

        // Clone
        var clone = clonedeep(this);
        if(!noRefs) {
            clone.originalStepInTree = originalOriginalStepInTree ? originalOriginalStepInTree : this; // double-cloning a Step retains originalStepInTree pointing at the original step under this.root
        }

        // Restore originals
        this.parent = originalParent;
        this.children = originalChildren;
        originalFunctionDeclarationInTree ? this.functionDeclarationInTree = originalFunctionDeclarationInTree : null; // if originalFunctionDeclarationInTree is undefined, don't do anything ("null;")
        originalContainingStepBlock ? this.containingStepBlock = originalContainingStepBlock : null;
        originalOriginalStepInTree ? this.originalStepInTree = originalOriginalStepInTree : null;

        return clone;
    }

    /**
     * @return {Array} Array of Step, which are the leaves of this step's underlying tree, [ this ] if this is itself a leaf
     */
    getLeaves() {
        if(this.children.length == 0) {
            // this is a leaf
            return [ this ];
        }
        else {
            var arr = [];
            this.children.forEach(child => {
                arr = arr.concat(child.getLeaves());
            });
            return arr;
        }
    }

    /**
     * Checks to see if this step, which is a function call, matches the given function declaration (case insensitive)
     * @param {Step} functionDeclaration - A function declaration step
     * @return {Boolean} true if they match, false if they don't
     * @throws {Error} if there's a case insensitive match but not a case sensitive match
     */
    isFunctionMatch(functionDeclaration) {
        var functionCallText = this.getFunctionCallText();
        var functionDeclarationText = functionDeclaration.text;

        // When hooking up functions, canonicalize by trim(), toLowerCase(), and replace \s+ with a single space
        // functionDeclarationText can have {{variables}}
        // functionCallText can have {{vars}}, {vars}, 'strings', "strings", and [elementFinders]

        functionDeclarationText = functionDeclarationText
            .trim()
            .replace(Constants.VAR_REGEX, '{}')
            .replace(/\s+/g, ' ')
            .replace(/\\\\/g, '\\') // replace \\ with \
            .replace(/\\\'/g, '\'') // replace \' with '
            .replace(/\\\"/g, '\"') // replace \" with "
            .toLowerCase();

        functionCallText = functionCallText
            .trim()
            .replace(Constants.STRING_LITERAL_REGEX, '{}')
            .replace(Constants.ELEMENTFINDER_REGEX, '{}')
            .replace(Constants.VAR_REGEX, '{}')
            .replace(/\s+/g, ' ')
            .replace(/\\\\/g, '\\') // replace \\ with \
            .replace(/\\\'/g, '\'') // replace \' with '
            .replace(/\\\"/g, '\"') // replace \" with "
            .toLowerCase();

        if(functionDeclarationText == functionCallText) {
            return true;
        }
        else if(functionDeclarationText.toLowerCase() == functionCallText.toLowerCase()) {
            utils.error("The function call '" + functionCallText + "' matches function declaration '" + functionDeclarationText + "', but must match case sensitively", this.filename, this.lineNumber);
        }
        else {
            return false;
        }
    }

    /**
     * @return {String} The text of the function call (without the leading {var}=, if one exists), null if step isn't a function call
     */
    getFunctionCallText() {
        if(this.isFunctionCall) {
            if(this.varsBeingSet && this.varsBeingSet.length == 1) { // {var} = Func
                return this.varsBeingSet[0].value;
            }
            else { // Func
                return this.text;
            }
        }
        else {
            return null;
        }
    }

    /**
     * Merges functionDeclarationInTree into this Step (identifier booleans are OR'ed in from functionDeclarationInTree into this)
     * If this.functionDeclarationInTree has a code block, it is copied into this
     * this.functionDeclarationText is set to the function declaration's text
     * This step must be a function call
     * @param {Step} functionDeclarationInTree - The function declaration that corresponds to this step
     */
    mergeInFunctionDeclaration(functionDeclarationInTree) {
        var isToDo = this.isToDo || functionDeclarationInTree.isToDo;
        isToDo ? this.isToDo = isToDo : null; // don't do anything ("null;") if isTodo isn't true

        var isManual = this.isManual || functionDeclarationInTree.isManual;
        isManual ? this.isManual = isManual : null;

        var isDebug = this.isDebug || functionDeclarationInTree.isDebug;
        isDebug ? this.isDebug = isDebug : null;

        var isOnly = this.isOnly || functionDeclarationInTree.isOnly;
        isOnly ? this.isOnly = isOnly : null;

        var isNonParallel = this.isNonParallel || functionDeclarationInTree.isNonParallel;
        isNonParallel ? this.isNonParallel = isNonParallel : null;

        var isSequential = this.isSequential || functionDeclarationInTree.isSequential;
        isSequential ? this.isSequential = isSequential : null;

        var isExpectedFail = this.isExpectedFail || functionDeclarationInTree.isExpectedFail;
        isExpectedFail ? this.isExpectedFail = isExpectedFail : null;

        var isBuiltIn = this.isBuiltIn || functionDeclarationInTree.isBuiltIn;
        isBuiltIn ? this.isBuiltIn = isBuiltIn : null;

        if(typeof functionDeclarationInTree.codeBlock != 'undefined') {
            this.codeBlock = functionDeclarationInTree.codeBlock;
        }

        this.functionDeclarationText = functionDeclarationInTree.text;
    }

    /**
     * @return {Step} clone of this function declaration step (using this.cloneForBranch()), converted into a function call step
     */
    cloneAsFunctionCall() {
        var clone = this.cloneForBranch();
        clone.isFunctionDeclaration = false;
        clone.isFunctionCall = true;
        return clone;
    }

    /**
     * Logs the given text to this Step
     */
    appendToLog(text) {
        if(!this.log) {
            this.log = "";
        }

        this.log += text + "\n";
    }

    /**
     * @return {Boolean} True if this Step completed already
     */
    isComplete() {
        return this.isPassed || this.isFailed || this.isSkipped;
    }
}
module.exports = Step;
