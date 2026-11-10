/**
 * Runs regexes in a worker thread with a time limit, so that a pattern with catastrophic
 * backtracking can be stopped. This module is also the worker's entry point: the bundle builds it a
 * second time as `dist/matchWorker.js`.
 */
import { findMatches, MatchRequest, MatchResponse } from "regex-explain";
import { parentPort, Worker, workerData } from "worker_threads";

/** How long a regex may run before it is stopped, in milliseconds. */
const MATCH_TIMEOUT_MS = 1000;

/** Marks the threads {@link RegexMatcher} starts, so that only they answer match requests. */
const WORKER_ROLE = "regexExplain.matcher";

/** Runs each match request in a new worker thread, stopping it if it runs too long. */
export class RegexMatcher {
  private readonly workerPath: string;
  private readonly timeoutMs: number;

  /**
   * Constructs a new RegexMatcher.
   *
   * @param workerPath This module compiled as the worker's entry point, such as `matchWorker.js`.
   * @param timeoutMs How long a request may run before it is stopped.
   */
  constructor(workerPath: string, timeoutMs = MATCH_TIMEOUT_MS) {
    this.workerPath = workerPath;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Finds the matches of a regex in text.
   *
   * @param request The regex, the text, and the most matches to return.
   *
   * @returns The matches; `timedOut` if the time limit passed, or `error` if the worker failed.
   */
  match(request: MatchRequest): Promise<MatchResponse> {
    return new Promise((resolve) => {
      const worker = new Worker(this.workerPath, { workerData: WORKER_ROLE });
      const finish = (response: MatchResponse): void => {
        clearTimeout(timer);
        void worker.terminate();
        resolve(response);
      };
      const timer = setTimeout(
        () => finish({ matches: [], truncated: false, timedOut: true }),
        this.timeoutMs
      );
      worker.once("message", (response: MatchResponse) => finish(response));
      worker.once("error", (error: Error) =>
        finish({ matches: [], truncated: false, error: error.message })
      );
      worker.postMessage(request);
    });
  }
}

if (workerData === WORKER_ROLE) {
  parentPort?.once("message", (request: MatchRequest) => {
    parentPort?.postMessage(findMatches(request));
  });
}
