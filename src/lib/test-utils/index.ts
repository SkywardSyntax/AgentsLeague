export { createMockCanvasContext, createMockOpenAIClient, createMockSpeechRecognition, installMockSpeechRecognition, createSSEBody, createDrawToolFixture } from './mocks';
export type { MockCanvasContext, MockOpenAIStreamEvent, MockSpeechRecognition } from './mocks';

export { rectElement, ellipseElement, lineElement, arrowElement, freehandElement, textElement, imageElement, allElements, userMessage, assistantMessage, voiceMessage, reasoningMessage, sampleMessages, idleState, processingState, errorState, idleVoiceSession, listeningVoiceSession, emptyCanvas, canvas50, canvas1000, toElementMap, defaultStroke, defaultFill, noFill, defaultTextStyle, defaultCamera } from './fixtures';

export { renderWithProviders, createMockStream, createMockDrawOpStream, createMockFetch, createRAFController, createMockWhiteboardStore, assertNoJank, assertMinFPS, measureTTFT, waitForCondition } from './helpers';
export type { RAFController, FrameTiming } from './helpers';
