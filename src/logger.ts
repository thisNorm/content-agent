import type { StructuredLog } from "./types";

export class RunLogger {
  private readonly decisions: string[] = [];
  private readonly implementations: string[] = [];
  private readonly problems: string[] = [];
  private readonly resolutions: string[] = [];
  private readonly nextSteps: string[] = [];

  info(message: string): void {
    console.log(`[info] ${message}`);
  }

  recordDecision(message: string): void {
    this.decisions.push(message);
    this.info(message);
  }

  recordImplementation(message: string): void {
    this.implementations.push(message);
    this.info(message);
  }

  recordProblem(message: string): void {
    this.problems.push(message);
    console.error(`[error] ${message}`);
  }

  recordResolution(message: string): void {
    this.resolutions.push(message);
    this.info(message);
  }

  addNextStep(message: string): void {
    this.nextSteps.push(message);
  }

  toStructuredLog(title: string): StructuredLog {
    return {
      title,
      date: new Date().toISOString().slice(0, 10),
      todayWork: this.decisions.concat(this.implementations).join("\n"),
      implementation: this.implementations.join("\n"),
      problems: this.problems.join("\n") || "없음",
      resolution: this.resolutions.join("\n") || "진행 중",
      next: this.nextSteps.join("\n") || "다음 Ready 글을 처리할 수 있도록 프롬프트와 셀렉터를 점검합니다.",
    };
  }
}
