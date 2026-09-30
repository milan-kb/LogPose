import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { AlertTriangle, LoaderCircle, Radio } from "lucide-react";
import { colourFor, formatTimestamp, modelAt, REGION } from "../data/ocean";
import type { OceanData, Point, Profile } from "../data/ocean";

interface Props {
  data: OceanData;
  depth: number;
  time: number;
  selected: string | null;
  observations: boolean;
  sections: boolean;
  resetKey: number;
  topView: boolean;
  onSelect: (id: string) => void;
}
const SCALE = 0.0028;
const xOf = (lon: number) => (lon - (REGION.west + REGION.east) / 2) * 9.9 / (REGION.east - REGION.west);
const zOf = (lat: number) => -(lat - (REGION.south + REGION.north) / 2) * 9.5 / (REGION.north - REGION.south);
const position = (lon: number, lat: number, depth: number) =>
  new THREE.Vector3(xOf(lon), -depth * SCALE, zOf(lat));

function disposeGroup(group: THREE.Group) {
  for (const child of [...group.children]) {
    child.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose();
      if (mesh.material)
        for (const material of Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material]) {
          (material as THREE.MeshBasicMaterial).map?.dispose();
          material.dispose();
        }
    });
    group.remove(child);
  }
}

function line(points: THREE.Vector3[], color: string, opacity = 1) {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
}

function label(
  text: string,
  location: THREE.Vector3,
  size = 0.35,
  color = "#9bafbc",
) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "500 27px system-ui";
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(text, 256, 43);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    }),
  );
  sprite.position.copy(location);
  sprite.scale.set(size * 8, size, 1);
  return sprite;
}

// Clip Natural Earth polygons to this regional display box, in geographic coordinates.
function clipRing(input: Point[]) {
  let result = input;
  for (const [axis, bound, sign] of [
    [0, REGION.west, 1],
    [0, REGION.east, -1],
    [1, REGION.south, 1],
    [1, REGION.north, -1],
  ]) {
    const output: Point[] = [];
    for (let i = 0; i < result.length; i++) {
      const a = result[i],
        b = result[(i + 1) % result.length];
      const ain = (a[axis] - bound) * sign >= 0,
        bin = (b[axis] - bound) * sign >= 0;
      if (ain) output.push(a);
      if (ain !== bin) {
        const f = (bound - a[axis]) / (b[axis] - a[axis]);
        output.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      }
    }
    result = output;
  }
  return result;
}

function fieldMesh(
  data: OceanData,
  time: number,
  mode: "slice" | "south" | "east",
  depth: number,
) {
  const positions: number[] = [],
    colors: number[] = [];
  const nu = 72,
    nv = mode === "slice" ? 76 : 48;
  const sample = (u: number, v: number) => {
    const lon =
      mode === "east"
        ? REGION.east
        : REGION.west + ((REGION.east - REGION.west) * u) / nu;
    const lat =
      mode === "south"
        ? REGION.south
        : REGION.south +
          (REGION.north - REGION.south) * (mode === "slice" ? v / nv : u / nu);
    const d = mode === "slice" ? depth : data.depths[0] + ((REGION.maxDepth - data.depths[0]) * v) / nv;
    const value = modelAt(data, lon, lat, d, time);
    const color =
      value === null
        ? [0, 0, 0]
        : new THREE.Color(...colourFor(value)).convertSRGBToLinear().toArray();
    return { point: position(lon, lat, d), value, color };
  };
  const grid = Array.from({ length: nv + 1 }, (_, v) =>
    Array.from({ length: nu + 1 }, (_, u) => sample(u, v)),
  );
  for (let v = 0; v < nv; v++)
    for (let u = 0; u < nu; u++) {
      const corners = [
        grid[v][u],
        grid[v][u + 1],
        grid[v + 1][u + 1],
        grid[v + 1][u],
      ];
      if (corners.some((c) => c.value === null)) continue;
      for (const i of [0, 1, 2, 0, 2, 3]) {
        positions.push(...corners[i].point.toArray());
        colors.push(...corners[i].color);
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: mode !== "slice",
      opacity: mode === "slice" ? 1 : 0.32,
      depthWrite: mode === "slice",
    }),
  );
  mesh.renderOrder = mode === "slice" ? 0 : 1;
  return mesh;
}

export default function OceanScene(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const world = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    fields: THREE.Group;
    instruments: THREE.Group;
    markerObjects: THREE.Object3D[];
    invalidate: () => void;
  } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    const element = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setStatus("error");
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor("#0c141e", 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.prepend(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive three-dimensional Bay of Bengal temperature field",
    );
    renderer.domElement.setAttribute("role", "img");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 150);
    camera.position.set(13.7, 11.4, 16.7);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, -1, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.minDistance = 10;
    controls.maxDistance = 36;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.update();
    const base = new THREE.Group(),
      fields = new THREE.Group(),
      instruments = new THREE.Group();
    scene.add(base, fields, instruments);
    const floor = new THREE.GridHelper(32, 32, "#233343", "#182635");
    floor.position.y = -3.65;
    (floor.material as THREE.Material).transparent = true;
    (floor.material as THREE.Material).opacity = 0.4;
    base.add(floor);
    const perimeter = (d: number) => [
      position(REGION.west, REGION.south, d),
      position(REGION.east, REGION.south, d),
      position(REGION.east, REGION.north, d),
      position(REGION.west, REGION.north, d),
      position(REGION.west, REGION.south, d),
    ];
    base.add(
      line(perimeter(0), "#7695a7", 0.65),
      line(perimeter(1200), "#487082", 0.7),
    );
    for (const lon of [REGION.west, REGION.east])
      for (const lat of [REGION.south, REGION.north])
        base.add(
          line(
            [position(lon, lat, 0), position(lon, lat, 1200)],
            "#658a9c",
            0.5,
          ),
        );
    for (let lon = REGION.west + 2; lon < REGION.east; lon += 2)
      base.add(
        line([position(lon, REGION.south, 0), position(lon, REGION.north, 0)], "#658997", 0.13),
      );
    for (let lat = REGION.south + 2; lat < REGION.north; lat += 2)
      base.add(
        line([position(REGION.west, lat, 0), position(REGION.east, lat, 0)], "#658997", 0.13),
      );
    for (const d of [0, 400, 800, 1200]) {
      base.add(label(`${d.toLocaleString()} m`, position(REGION.east + 0.5, REGION.south - 0.3, d), 0.35));
      base.add(
        line([position(REGION.east, REGION.south, d), position(REGION.east + 0.2, REGION.south, d)], "#94b5c5", 0.65),
      );
    }
    for (const lon of [84, 86, 88, 90])
      base.add(label(`${lon}° E`, position(lon, REGION.south - 0.6, 1200), 0.32));
    for (const lat of [12, 16, 20])
      base.add(label(`${lat}° N`, position(REGION.west - 0.6, lat, 0), 0.32));
    for (const ring of props.data.land) {
      const clipped = clipRing(ring);
      if (clipped.length < 3) continue;
      const shape = new THREE.Shape(
        clipped.map(([lon, lat]) => new THREE.Vector2(xOf(lon), -zOf(lat))),
      );
      const land = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        new THREE.MeshBasicMaterial({
          color: "#243745",
          side: THREE.DoubleSide,
        }),
      );
      land.rotation.x = -Math.PI / 2;
      land.position.y = 0.045;
      base.add(land);
      base.add(
        line(
          [...clipped, clipped[0]].map(
            ([lon, lat]) => new THREE.Vector3(xOf(lon), 0.06, zOf(lat)),
          ),
          "#668696",
          0.7,
        ),
      );
    }
    base.add(
      label("I N D I A", new THREE.Vector3(xOf(83), 0.13, zOf(19.5)), 0.4),
    );
    base.add(
      label(
        "B A Y   O F   B E N G A L",
        new THREE.Vector3(xOf(87), 0.05, zOf(19)),
        0.29,
        "#80a2b1",
      ),
    );
    let animation = 0;
    const invalidate = () => {
      if (!animation) animation = requestAnimationFrame(render);
    };
    const state = {
      renderer,
      scene,
      camera,
      controls,
      fields,
      instruments,
      markerObjects: [] as THREE.Object3D[],
      invalidate,
    };
    world.current = state;
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(height, 1);
      camera.fov = THREE.MathUtils.radToDeg(
        2 *
          Math.atan(
            Math.tan(THREE.MathUtils.degToRad(35 / 2)) *
              Math.max(1, 1.25 / camera.aspect),
          ),
      );
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(() => {
      resize();
      invalidate();
    });
    observer.observe(element);
    resize();
    const projected = new THREE.Vector3();
    const render = () => {
      animation = 0;
      const moving = controls.update();
      renderer.render(scene, camera);
      const { clientWidth: width, clientHeight: height } = element;
      const hostRect = element.getBoundingClientRect();
      const occupied = Array.from(
        element.parentElement?.querySelectorAll<HTMLElement>(
          ".scene-heading, .scene-actions, .depth-caption, .scene-bottom",
        ) ?? [],
      ).map((node) => {
        const r = node.getBoundingClientRect();
        return {
          x: r.left - hostRect.left,
          y: r.top - hostRect.top,
          w: r.width,
          h: r.height,
        };
      });
      const profiles = [
        ...latest.current.data.profiles[latest.current.time],
      ].sort(
        (a, b) =>
          Number(b.platform === latest.current.selected) -
          Number(a.platform === latest.current.selected),
      );
      // ponytail: greedy label placement is bounded to five demo profiles; cluster labels for dense real datasets.
      for (const p of profiles) {
        const button = labels.current?.querySelector<HTMLButtonElement>(
          `[data-platform="${p.platform}"]`,
        );
        if (!button) continue;
        projected.copy(position(p.lon, p.lat, 0));
        projected.y = 0.25;
        projected.project(camera);
        const hidden =
          Math.abs(projected.x) > 1 ||
          Math.abs(projected.y) > 1 ||
          projected.z > 1;
        button.style.visibility = hidden ? "hidden" : "visible";
        const connector = labels.current?.querySelector<SVGGElement>(
          `[data-connector="${p.platform}"]`,
        );
        if (connector)
          connector.style.visibility = hidden ? "hidden" : "visible";
        if (hidden) continue;
        const anchorX = (projected.x * 0.5 + 0.5) * width,
          anchorY = (-projected.y * 0.5 + 0.5) * height;
        const w = button.offsetWidth,
          h = button.offsetHeight;
        const candidates = [12, 48, 90, 140]
          .flatMap((gap) => [
            [anchorX + gap, anchorY - h / 2],
            [anchorX - w / 2, anchorY - h - gap],
            [anchorX - w - gap, anchorY - h / 2],
            [anchorX - w / 2, anchorY + gap],
          ])
          .map(([x, y]) => ({
            x: Math.max(8, Math.min(width - w - 8, x)),
            y: Math.max(8, Math.min(height - h - 8, y)),
            w,
            h,
          }));
        const box =
          candidates.find((c) =>
            occupied.every(
              (r) =>
                c.x + c.w + 7 < r.x ||
                c.x > r.x + r.w + 7 ||
                c.y + c.h + 7 < r.y ||
                c.y > r.y + r.h + 7,
            ),
          ) ?? candidates[0];
        occupied.push(box);
        button.style.left = `${box.x}px`;
        button.style.top = `${box.y}px`;
        const tooltip = button.querySelector<HTMLElement>(".marker-tooltip");
        if (tooltip)
          tooltip.style.left = `${Math.max(tooltip.offsetWidth / 2 + 8, Math.min(width - tooltip.offsetWidth / 2 - 8, box.x + w / 2)) - box.x}px`;
        const stem = connector?.querySelector("line"),
          point = connector?.querySelector("circle");
        if (stem && point) {
          stem.setAttribute("x1", String(anchorX));
          stem.setAttribute("y1", String(anchorY));
          stem.setAttribute(
            "x2",
            String(Math.max(box.x, Math.min(box.x + w, anchorX))),
          );
          stem.setAttribute(
            "y2",
            String(Math.max(box.y, Math.min(box.y + h, anchorY))),
          );
          point.setAttribute("cx", String(anchorX));
          point.setAttribute("cy", String(anchorY));
        }
      }
      const depthTag = labels.current?.querySelector<HTMLElement>(
        "[data-depth-slice]",
      );
      if (depthTag) {
        projected.copy(position(REGION.east - 0.15, (REGION.south + REGION.north) / 2, latest.current.depth)).project(camera);
        const hidden =
          Math.abs(projected.x) > 1 ||
          Math.abs(projected.y) > 1 ||
          projected.z > 1;
        depthTag.style.visibility = hidden ? "hidden" : "visible";
        depthTag.style.left = `${(projected.x * 0.5 + 0.5) * width}px`;
        depthTag.style.top = `${(-projected.y * 0.5 + 0.5) * height}px`;
      }
      if (moving) invalidate();
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      setStatus("error");
      cancelAnimationFrame(animation);
    };
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    controls.addEventListener("change", invalidate);
    invalidate();
    setStatus("ready");
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      controls.removeEventListener("change", invalidate);
      controls.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      disposeGroup(base);
      disposeGroup(fields);
      disposeGroup(instruments);
      renderer.dispose();
      renderer.domElement.remove();
      world.current = null;
    };
  }, [props.data]);

  useEffect(() => {
    const state = world.current;
    if (!state) return;
    disposeGroup(state.fields);
    state.fields.add(fieldMesh(props.data, props.time, "slice", props.depth));
    if (props.sections) {
      state.fields.add(fieldMesh(props.data, props.time, "south", props.depth));
      state.fields.add(fieldMesh(props.data, props.time, "east", props.depth));
    }
    state.fields.add(
      line(
        [
          position(REGION.west, REGION.south, props.depth),
          position(REGION.east, REGION.south, props.depth),
          position(REGION.east, REGION.north, props.depth),
          position(REGION.west, REGION.north, props.depth),
          position(REGION.west, REGION.south, props.depth),
        ],
        "#b9eee0",
        0.7,
      ),
    );
    state.invalidate();
  }, [props.data, props.depth, props.time, props.sections, status]);

  useEffect(() => {
    const state = world.current;
    if (!state) return;
    disposeGroup(state.instruments);
    if (props.observations) for (const p of props.data.profiles[props.time]) {
      const active = p.platform === props.selected;
      const start = position(p.lon, p.lat, 0);
      start.y = 0.25;
      const stem = line(
        [start, position(p.lon, p.lat, active ? Math.min(1200, p.depths.at(-1)!) : props.depth)],
        active ? "#78dcca" : "#b1cdd2",
        active ? 1 : 0.3,
      );
      if (active) {
        stem.material.depthTest = false;
        stem.renderOrder = 3;
      }
      state.instruments.add(stem);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(active ? 0.17 : 0.12, 0.023, 8, 32),
        new THREE.MeshBasicMaterial({
          color: active ? "#6be5ca" : "#cce8e4",
          depthTest: false,
        }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.copy(start);
      state.instruments.add(ring);
      if (active)
        for (const depth of p.depths.filter(d => d <= REGION.maxDepth)) {
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.045, 8, 8),
            new THREE.MeshBasicMaterial({ color: "#78dcca", depthTest: false }),
          );
          dot.position.copy(position(p.lon, p.lat, depth));
          dot.renderOrder = 3;
          state.instruments.add(dot);
        }
    }
    state.invalidate();
  }, [
    props.data,
    props.time,
    props.depth,
    props.selected,
    props.observations,
    status,
  ]);

  useEffect(() => {
    const state = world.current;
    if (!state) return;
    const damping = state.controls.enableDamping;
    state.controls.enableDamping = false;
    state.controls.update();
    if (props.topView) state.camera.position.set(0, 24, 0.1);
    else state.camera.position.set(13.7, 11.4, 16.7);
    state.camera.zoom = 1;
    state.camera.updateProjectionMatrix();
    state.controls.target.set(0, -1, 0);
    state.controls.update();
    state.controls.enableDamping = damping;
    state.invalidate();
  }, [props.resetKey, props.topView]);

  return (
    <div
      className="ocean-canvas"
      ref={host}
      data-testid="ocean-scene"
      data-depth={props.depth}
      data-time={props.time}
    >
      <div className="marker-layer" ref={labels}>
        <div className="depth-slice-tag" data-depth-slice aria-hidden="true">
          <span>{props.depth.toLocaleString()} m</span>
          depth slice
        </div>
        {props.observations && (
          <svg className="marker-connectors" aria-hidden="true">
            {props.data.profiles[props.time].map((p) => (
              <g
                key={p.platform}
                data-connector={p.platform}
                className={props.selected === p.platform ? "selected" : ""}
              >
                <line />
                <circle r="3" />
              </g>
            ))}
          </svg>
        )}
        {props.observations &&
          status === "ready" &&
          props.data.profiles[props.time].map((p: Profile) => (
            <button
              key={p.platform}
              data-platform={p.platform}
              className={`scene-marker ${props.selected === p.platform ? "selected" : ""}`}
              onClick={() => props.onSelect(p.platform)}
              aria-label={`Select profile ${p.platform}`}
              aria-pressed={props.selected === p.platform}
              aria-controls={
                props.selected === p.platform ? "profile-inspector" : undefined
              }
              aria-describedby={`tooltip-${p.platform}`}
            >
              <Radio size={15} />
              <span className="marker-label">
                {props.selected === p.platform
                  ? `Observation ${p.platform}`
                  : p.platform}
              </span>
              <span
                className="marker-tooltip"
                role="tooltip"
                id={`tooltip-${p.platform}`}
              >
                <strong>Observation {p.platform}</strong>
                <span>
                  {p.lat.toFixed(2)}° N, {p.lon.toFixed(2)}° E
                </span>
                <span>{p.depths[0].toFixed(1)}–{p.depths.at(-1)!.toFixed(0)} m · cycle {p.cycle}</span>
                <span>{formatTimestamp(p.time)}</span>
                <small>Argo · delayed mode · adjusted QC 1</small>
              </span>
            </button>
          ))}
      </div>
      {status === "loading" && (
        <div className="scene-state">
          <LoaderCircle className="spin" />
          Preparing the water column…
        </div>
      )}
      {status === "error" && (
        <div className="scene-state error">
          <AlertTriangle />
          <strong>3D rendering is unavailable</strong>
          <span>
            Enable browser hardware acceleration and reload. Profile comparisons
            remain available from the instrument list.
          </span>
        </div>
      )}
    </div>
  );
}
