import type { AnchorPoint, Vector2D } from './NavigationMesh.ts';

/**
 * Seat / spot reservations so two Sims never share one chair, couch cushion
 * or standing spot. Each agent holds at most one reservation (the anchor it is
 * walking to or occupying). Anchors are keyed by position, so two different
 * AnchorPoint objects describing the same chair still collide.
 */
export class AnchorRegistry {
  private readonly byKey = new Map<string, string>();
  private readonly byAgent = new Map<string, string>();

  static key(a: Vector2D): string {
    return `${a.x.toFixed(2)},${a.z.toFixed(2)}`;
  }

  /** Who holds this anchor (undefined when free). */
  public holder(a: AnchorPoint): string | undefined {
    return this.byKey.get(AnchorRegistry.key(a));
  }

  public isFree(a: AnchorPoint, who?: string): boolean {
    const h = this.holder(a);
    return h === undefined || h === who;
  }

  /** Reserve `a` for `who`, dropping `who`'s previous reservation. Fails if someone else holds it. */
  public reserve(a: AnchorPoint, who: string): boolean {
    const k = AnchorRegistry.key(a);
    const h = this.byKey.get(k);
    if (h !== undefined && h !== who) return false;
    this.release(who);
    this.byKey.set(k, who);
    this.byAgent.set(who, k);
    return true;
  }

  public release(who: string): void {
    const k = this.byAgent.get(who);
    if (k === undefined) return;
    this.byAgent.delete(who);
    if (this.byKey.get(k) === who) this.byKey.delete(k);
  }

  public reservationOf(who: string): string | undefined {
    return this.byAgent.get(who);
  }
}
