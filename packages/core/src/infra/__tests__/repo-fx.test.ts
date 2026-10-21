import { Effect, Exit } from "effect";
import { describe, expect, it, vi } from "vitest";

import type { DbExec } from "@watchdog/db";

import { Db } from "../db-service";
import { repoFx, repoFxDb } from "../repo-fx";
import { ConflictError, InternalError } from "../tagged-errors";

const handle: DbExec = Object.create(null);

describe("repoFx", () => {
  it("passes the explicit handle and arguments through, with the repo as this", async () => {
    const fx = repoFx(() => ({
      async twice(_exec: DbExec, value: number): Promise<number> {
        return value * 2;
      },
      async viaThis(h: DbExec, value: number): Promise<number> {
        return await this.twice(h, value);
      },
    }));
    expect(await Effect.runPromise(fx.viaThis(handle, 4))).toBe(8);
  });

  it("looks the method up per call, so a spy on the repo sees it", async () => {
    const repo = {
      async read(_exec: DbExec): Promise<number> {
        return 1;
      },
    };
    const fx = repoFx(() => repo);
    const spy = vi.spyOn(repo, "read").mockResolvedValue(2);
    expect(await Effect.runPromise(fx.read(handle))).toBe(2);
    expect(spy).toHaveBeenCalledWith(handle);
  });

  it("does nothing until the Effect runs", async () => {
    let ran = 0;
    const fx = repoFx(() => ({
      async touch(_exec: DbExec): Promise<number> {
        ran += 1;
        return ran;
      },
    }));
    const effect = fx.touch(handle);
    expect(ran).toBe(0);
    expect(await Effect.runPromise(effect)).toBe(1);
  });

  it("maps errors as tryDb does: tagged errors pass through, a missing history context is InternalError", async () => {
    const fx = repoFx(() => ({
      async tagged(_exec: DbExec): Promise<never> {
        throw new ConflictError({ reason: "taken" });
      },
      async refused(_exec: DbExec): Promise<never> {
        throw Object.assign(new Error("graph write refused"), {
          code: "WD001",
        });
      },
    }));
    expect(
      await Effect.runPromise(Effect.flip(fx.tagged(handle)))
    ).toBeInstanceOf(ConflictError);
    expect(
      await Effect.runPromise(Effect.flip(fx.refused(handle)))
    ).toBeInstanceOf(InternalError);
  });

  it("keeps what it cannot map a defect", async () => {
    const fx = repoFx(() => ({
      async boom(_exec: DbExec): Promise<never> {
        throw new Error("driver");
      },
    }));
    const exit = await Effect.runPromiseExit(fx.boom(handle));
    expect(Exit.isFailure(exit) && Exit.hasDies(exit)).toBe(true);
  });
});

describe("repoFxDb", () => {
  it("supplies the Db service's client as the handle", async () => {
    const onPool = repoFxDb(
      repoFx(() => ({
        async echo(h: DbExec, value: string): Promise<[DbExec, string]> {
          return [h, value];
        },
      }))
    );
    const [seen, value] = await Effect.runPromise(
      onPool.echo("b").pipe(Effect.provide(Db.layerOf(handle)))
    );
    expect(seen).toBe(handle);
    expect(value).toBe("b");
  });
});
