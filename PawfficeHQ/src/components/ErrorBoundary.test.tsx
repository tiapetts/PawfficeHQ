import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "./ErrorBoundary";
function BrokenScreen(): never { throw new Error("test crash"); }
describe("ErrorBoundary", () => {
  afterEach(() => vi.restoreAllMocks());
  it("shows a recoverable screen when a child crashes", () => { vi.spyOn(console,"error").mockImplementation(()=>undefined); render(<ErrorBoundary><BrokenScreen /></ErrorBoundary>); expect(screen.getByRole("alert")).toHaveTextContent("Your information is still safe"); expect(screen.getByRole("button",{name:"Refresh PawfficeHQ"})).toBeVisible(); expect(screen.getByRole("link",{name:"Contact support"})).toHaveAttribute("href","/support.html"); });
});
