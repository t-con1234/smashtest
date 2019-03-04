const chai = require('chai');
const chaiSubset = require('chai-subset');
const expect = chai.expect;
const assert = chai.assert;
const util = require('util');
const Step = require('../step.js');
const StepBlock = require('../stepblock.js');

chai.use(chaiSubset);

describe("Step", function() {
    var root = null;

    beforeEach(function() {
        /*
        A
            B

            C
                D

        E
        F
        */

        root = new Step();

        var A = new Step();
        A.text = "A";
        A.varsList = ["A1", "A2"];

        var B = new Step();
        B.text = "B";
        B.varsList = ["B1", "B2"];

        var C = new Step();
        C.text = "C";
        C.varsList = ["C1", "C2"];

        var D = new Step();
        D.text = "D";
        D.varsList = ["D1", "D2"];

        var E = new Step();
        E.text = "E";
        E.varsList = ["E1", "E2"];
        E.parent = null;
        E.children = [];

        var F = new Step();
        F.text = "F";
        F.varsList = ["F1", "F2"];
        F.parent = null;
        F.children = [];

        var EF = new StepBlock();
        EF.parent = root;
        EF.children = [];
        EF.steps = [ E, F ];
        E.containingStepBlock = EF;
        F.containingStepBlock = EF;

        D.parent = C;
        D.children = [];

        C.parent = A;
        C.children = [ D ];

        B.parent = A;
        B.children = [];

        A.parent = root;
        A.children = [ B, C ];

        root.parent = null;
        root.children = [ A, EF ];
    });

    describe("cloneForBranch()", function() {
        it("can properly clone, chlidren are removed from the clone, and the original and cloned objects are distinct", function() {
            var C = root.children[0].children[1];
            var clonedC = C.cloneForBranch();

            clonedC.cloneMark = true;
            C.originalMark = true;

            expect(C).to.containSubset({
                text: 'C',
                varsList: [ 'C1', 'C2' ],
                cloneMark: undefined,
                originalMark: true,
                parent: { text: 'A' },
                children: [
                    {
                        text: 'D',
                        varsList: [ 'D1', 'D2' ],
                        cloneMark: undefined,
                        originalMark: undefined,
                        parent: {
                            cloneMark: undefined,
                            originalMark: true,
                            originalStep: undefined
                        },
                        children: []
                    }
                ],
                originalStep: undefined
            });

            expect(clonedC).to.containSubset({
                text: 'C',
                varsList: [ 'C1', 'C2' ],
                cloneMark: true,
                originalMark: undefined,
                parent: null,
                children: undefined,
                originalStep: {
                    originalMark: true,
                    cloneMark: undefined
                }
            });
        });

        it("can properly double-clone a step", function() {
            var C = root.children[0].children[1];
            var clonedC1 = C.cloneForBranch();
            var clonedC2 = clonedC1.cloneForBranch();

            clonedC2.cloneMark = true;
            C.originalMark = true;

            expect(C).to.containSubset({
                text: 'C',
                varsList: [ 'C1', 'C2' ],
                cloneMark: undefined,
                originalMark: true,
                parent: { text: 'A' },
                children: [
                    {
                        text: 'D',
                        varsList: [ 'D1', 'D2' ],
                        cloneMark: undefined,
                        originalMark: undefined,
                        parent: {
                            cloneMark: undefined,
                            originalMark: true,
                            originalStep: undefined
                        },
                        children: []
                    }
                ],
                originalStep: undefined
            });

            expect(clonedC1).to.containSubset({
                text: 'C',
                varsList: [ 'C1', 'C2' ],
                cloneMark: undefined,
                originalMark: undefined,
                parent: null,
                children: undefined,
                originalStep: {
                    originalMark: true,
                    cloneMark: undefined
                }
            });

            expect(clonedC2).to.containSubset({
                text: 'C',
                varsList: [ 'C1', 'C2' ],
                cloneMark: true,
                originalMark: undefined,
                parent: null,
                children: undefined,
                originalStep: {
                    originalMark: true,
                    cloneMark: undefined
                }
            });
        });
    });

    describe("getLeaves()", function() {
        it("returns all leaves", function() {
            var leaves = root.getLeaves();
            root.rootMark = true;

            expect(leaves).to.containSubset([
                {
                    text: 'B',
                    varsList: [ 'B1', 'B2' ],
                    parent: { text: 'A' },
                    children: []
                },
                {
                    text: 'D',
                    varsList: [ 'D1', 'D2' ],
                    parent: { text: 'C' },
                    children: []
                },
                {
                    steps: [
                        {
                            text: 'E',
                            varsList: [ 'E1', 'E2' ],
                            parent: null,
                            children: []
                        },
                        {
                            text: 'F',
                            varsList: [ 'F1', 'F2' ],
                            parent: null,
                            children: []
                        }
                    ],
                    parent: { rootMark: true },
                    children: []
                }
            ]);
        });

        it("returns an array with itself when called on a leaf", function() {
            var D = root.children[0].children[1].children[0];
            var leaves = D.getLeaves();

            expect(leaves).to.containSubset([
                {
                    text: 'D',
                    varsList: [ 'D1', 'D2' ],
                    parent: { text: 'C' },
                    children: []
                }
            ]);

            expect(leaves).to.have.length(1);
        });
    });

    describe("getHookCanonicalText()", function() {
        it("generates canonical text for hooks", function() {
            var step = new Step();

            step.text = " After   EVERY Branch  ";
            expect(step.getHookCanonicalText()).to.equal("after every branch");
        });
    });

    describe("isFunctionMatch()", function() {
        var functionDeclaration = new Step();
        var functionCall = new Step();

        functionDeclaration.isFunctionDeclaration = true;
        functionCall.isFunctionCall = true;

        it("matches a function call and function declaration with the same text", function() {
            functionDeclaration.text = "Step name here";
            functionCall.text = "Step name here";
            expect(functionCall.isFunctionMatch(functionDeclaration)).to.equal(true);
        });

        it("doesn't match a function call and function declaration with different text", function() {
            functionDeclaration.text = "Step name here";
            functionCall.text = "Different name here";
            expect(functionCall.isFunctionMatch(functionDeclaration)).to.equal(false);
        });

        it("matches a function call and function declaration with the same text but differing amounts of whitespace", function() {
            functionDeclaration.text = "Step name here";
            functionCall.text = "  Step  name here ";
            expect(functionCall.isFunctionMatch(functionDeclaration)).to.equal(true);
        });

        it("throws an exception if a function call and function declaration match case insensitively but not case sensitively", function() {
            functionDeclaration.text = "Step name here";
            functionCall.text = "step name here";
            assert.throws(() => {
                functionCall.isFunctionMatch(functionDeclaration);
            });
        });

        it("matches a function declaration with {{vars}} and a function call with {{vars}}, {vars}, 'strings', \"strings\", and [ElementFinders]", function() {
            functionDeclaration.text = "Step {{var1}} and {{var2}} {{var3}} also {{var4}}, {{var5}}";
            functionCall.text = "Step {{varA}} and  {varB} 'string C' also \"stringD\", [4th 'Login' button]";
            expect(functionCall.isFunctionMatch(functionDeclaration)).to.equal(true);
        });

        it("doesn't match a function declaration with {{vars}} and a function call with extra {vars} at the end", function() {
            functionDeclaration.text = "Step {{var1}}";
            functionCall.text = "Step {varA} {varB}";
            expect(functionCall.isFunctionMatch(functionDeclaration)).to.equal(false);
        });

        it("doesn't match a function declaration with {{vars}} and a function call with extra 'strings' at the end", function() {
            functionDeclaration.text = "Step {{var1}}";
            functionCall.text = "Step 'stringA' 'stringB'";
            expect(functionCall.isFunctionMatch(functionDeclaration)).to.equal(false);
        });

        it("doesn't match a function declaration with {{vars}} and a function call with extra [ElementFinders] at the end", function() {
            functionDeclaration.text = "Step {{var1}}";
            functionCall.text = "Step {varA} ['element' finderB]";
            expect(functionCall.isFunctionMatch(functionDeclaration)).to.equal(false);
        });
    });

    describe("getFunctionCallText()", function() {
        it("returns function call text for a function call", function() {
            var step = new Step();
            step.isFunctionCall = true;
            step.text = "Function call";
            expect(step.getFunctionCallText()).to.equal("Function call");
        });

        it("returns function call text for a function call in form {var} = F", function() {
            var step = new Step();
            step.isFunctionCall = true;
            step.text = "{var} = Function call";
            step.varsBeingSet = [ {name: "var", value: "Function call", isLocal: false} ];
            expect(step.getFunctionCallText()).to.equal("Function call");
        });

        it("returns null for a non-function call", function() {
            var step = new Step();
            step.isFunctionCall = false;
            expect(step.getFunctionCallText()).to.equal(null);
        });
    });

    describe("mergeInFunctionDeclaration()", function() {
        it("merges in function declaration", function() {
            var step = new Step();
            step.isToDo = true;
            step.isManual = false;
            step.isDebug = false;

            step.functionDeclarationStep = new Step();
            step.functionDeclarationStep.isToDo = true;
            step.functionDeclarationStep.isManual = true;
            step.functionDeclarationStep.isDebug = false;

            step.mergeInFunctionDeclaration();

            expect(step.isToDo).to.equal(true);
            expect(step.isManual).to.equal(true);
            expect(step.isDebug).to.equal(false);
        });

        it("merges in code block", function() {
            var step = new Step();

            step.functionDeclarationStep = new Step();
            step.functionDeclarationStep.codeBlock = 'code';

            step.mergeInFunctionDeclaration();

            expect(step.codeBlock).to.equal('code');
        });
    });

    describe("cloneAsFunctionCall()", function() {
        it("clones a function declaration step into a function call step", function() {
            var functionDeclarationStep = new Step();
            functionDeclarationStep.isFunctionDeclaration = true;
            functionDeclarationStep.text = "My function";
            functionDeclarationStep.children = [ new Step() ];
            functionDeclarationStep.children[0].text = "Child step";

            var clone = functionDeclarationStep.cloneAsFunctionCall();

            expect(clone.isFunctionDeclaration).to.equal(false);
            expect(clone.isFunctionCall).to.equal(true);
            expect(clone.text).to.equal("My function");
            expect(clone.children).to.equal(undefined);
        });
    });
});
