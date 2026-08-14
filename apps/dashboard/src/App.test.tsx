// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import datasetJson from "../public/dashboard-data.json";
import { App } from "./App";
import type { DashboardDataset } from "./types";

const dataset = datasetJson as unknown as DashboardDataset;

afterEach(cleanup);

describe("evidence dashboard", () => {
  it("shows a truthful loading state", () => {
    render(<App loader={() => new Promise(() => undefined)} />);
    expect(screen.getByRole("heading", { name: "Carregando evidências" })).toBeDefined();
  });

  it("renders real evidence and the retained snapshot as stale", async () => {
    const user = userEvent.setup();
    render(<App loader={async () => dataset} now={new Date("2026-08-14T00:02:00.000Z")} />);
    expect(await screen.findByRole("heading", { name: "Evidence overview" })).toBeDefined();
    expect(screen.getAllByText("STALE").length).toBeGreaterThan(0);
    expect(screen.getByText("600")).toBeDefined();
    expect(screen.getByText("observer-local")).toBeDefined();

    await user.selectOptions(screen.getByRole("combobox", { name: "Scenario" }), "healthy");
    expect(screen.getByText("No controlled findings")).toBeDefined();
  });

  it("exposes an explicit error and recovers through retry", async () => {
    const loader = vi.fn<() => Promise<DashboardDataset>>()
      .mockRejectedValueOnce(new Error("fixture unavailable"))
      .mockResolvedValue(dataset);
    render(<App loader={loader} now={new Date("2026-08-14T00:00:30.000Z")} />);
    expect(await screen.findByRole("heading", { name: "Evidência indisponível" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("heading", { name: "Evidence overview" })).toBeDefined();
    expect(screen.getAllByText("FRESH").length).toBeGreaterThan(0);
  });
});
