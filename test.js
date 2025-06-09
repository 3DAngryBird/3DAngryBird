import * as THREE from "three";
import * as CANNON from "cannon-es";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

let trajectoryLine = null;
let cameraMode = "side"; // front: 정면(조준), side: 측면(발사)
let isDragging = false;
let dragStart = null;
let dragDeltaX = 0;
let dragDeltaY = 0;
let launchReady = false;
let launchPower = 0;
let launchHeight = 0;
let canLaunch = false;

// 방향 벡터 저장
let directionVec = new THREE.Vector3(0, 0, -1);

// === 씬, 카메라, 렌더러 ===
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 2, 5);
scene.add(camera);

const clock = new THREE.Clock();
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// === 축 시각화 + 라벨 ===
const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);
const axisLabels = [];
[
  ["X", new THREE.Vector3(5, 0, 0)],
  ["Y", new THREE.Vector3(0, 5, 0)],
  ["Z", new THREE.Vector3(0, 0, 5)],
].forEach(([text, pos]) => {
  const div = document.createElement("div");
  div.style.position = "absolute";
  div.style.color = "white";
  div.style.fontSize = "14px";
  div.innerHTML = text;
  document.body.appendChild(div);
  axisLabels.push({ div, position: pos });
});

// === 방향선 ===
const directionLineMaterial = new THREE.LineBasicMaterial({ color: 0xffff00 });
let directionLine = null;
function updateDirectionLine() {
  if (directionLine) scene.remove(directionLine);
  const from = new THREE.Vector3(0, 0.05, 3);
  const to = directionVec.clone().multiplyScalar(5).add(from);
  const geom = new THREE.BufferGeometry().setFromPoints([from, to]);
  directionLine = new THREE.Line(geom, directionLineMaterial);
  scene.add(directionLine);
}

// === 조명 ===
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 5);
scene.add(light);

// === 물리 world ===
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });

// === 바닥 ===
const textureLoader = new THREE.TextureLoader();
const grassTexture = textureLoader.load("./models/onetonegrass.png");
grassTexture.wrapS = THREE.RepeatWrapping;
grassTexture.wrapT = THREE.RepeatWrapping;
grassTexture.repeat.set(50, 50);

const floorGeo = new THREE.BoxGeometry(100, 0.1, 100);
const floorMat = new THREE.MeshStandardMaterial({ map: grassTexture });
const floorMesh = new THREE.Mesh(floorGeo, floorMat);
floorMesh.position.set(0, -0.05, 0);
floorMesh.receiveShadow = true;
scene.add(floorMesh);
const floorBody = new CANNON.Body({
  type: CANNON.Body.STATIC,
  shape: new CANNON.Box(new CANNON.Vec3(100, 0.1, 100)),
  position: new CANNON.Vec3(0, -0.1, 0),
});
world.addBody(floorBody);

// 배경(그냥 하늘색으로)
scene.background = new THREE.Color(0x87ceeb);

// === 구조물: GLTF 모델 로딩 ===
const boxes = [];
const loader = new GLTFLoader();
loader.load("./models/Test2.glb", (gltf) => {
  gltf.scene.traverse((child) => {
    if (child.isMesh) {
      const mesh = child.clone();
      mesh.geometry.computeBoundingBox();
      mesh.castShadow = true;
      scene.add(mesh);

      const worldBBox = new THREE.Box3().setFromObject(mesh);
      const size = worldBBox.getSize(new THREE.Vector3());
      const halfExtents = new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2);
      const shape = new CANNON.Box(halfExtents);

      // defaultMat 정의 전에 사용하므로 임시로 기본 머티리얼
      const defaultMat = world.defaultMaterial;
      const body = new CANNON.Body({ mass: 1, shape });
      body.material = defaultMat;
      body.position.copy(mesh.getWorldPosition(new THREE.Vector3()));
      body.quaternion.copy(mesh.getWorldQuaternion(new THREE.Quaternion()));
      world.addBody(body);

      boxes.push({ mesh, body });
    }
  });
});

// === 공 ===
const ballGeo = new THREE.SphereGeometry(0.2);
const ballMat = new THREE.MeshStandardMaterial({ color: 0xff3333 });
const ballMesh = new THREE.Mesh(ballGeo, ballMat);
scene.add(ballMesh);
const ballBody = new CANNON.Body({
  mass: 1,
  shape: new CANNON.Sphere(0.2),
  position: new CANNON.Vec3(0, 0.2, 3),
});
world.addBody(ballBody);

// === 캐릭터 관리 ===
const characters = [];
let charCount = 0;

const charCountDiv = document.createElement("div");
charCountDiv.style.position = "absolute";
charCountDiv.style.top = "10px";
charCountDiv.style.left = "10px";
charCountDiv.style.color = "white";
charCountDiv.style.fontSize = "18px";
charCountDiv.style.fontFamily = "sans-serif";
charCountDiv.innerHTML = "Characters: 0";
document.body.appendChild(charCountDiv);

const charMaterial = new CANNON.Material("charMat");
const defaultMat = world.defaultMaterial;
const charDefaultContact = new CANNON.ContactMaterial(charMaterial, defaultMat, {
  friction: 1,
  restitution: 0.5,
});
world.addContactMaterial(charDefaultContact);

function updateCharCount() {
  charCountDiv.innerHTML = `Characters: ${charCount}`;
}

function spawnCharacter(position) {
  const geo = new THREE.SphereGeometry(0.2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(position);
  scene.add(mesh);
  const body = new CANNON.Body({
    mass: 1,
    shape: new CANNON.Sphere(0.2),
    position: new CANNON.Vec3(position.x, position.y, position.z),
    material: charMaterial,
  });
  world.addBody(body);

  body.addEventListener("collide", (event) => {
    const impact = event.contact.getImpactVelocityAlongNormal();
    if (Math.abs(impact) > DEATH_THRESHOLD && mesh.visible) {
      setTimeout(() => {
        setTimeout(() => {
          world.removeBody(body);
          charCount = Math.max(0, charCount - 1);
          updateCharCount();
        }, 500);
        const shape = body.shapes[0];
        if (shape instanceof CANNON.Sphere) {
          shape.radius *= 1.1;
          body.updateBoundingRadius();
          body.updateMassProperties();
        }
        mesh.visible = false;
      }, 1000);
    }
  });

  characters.push({ mesh, body });
  charCount = characters.length;
  updateCharCount();
}

const DEATH_THRESHOLD = 0.5;
spawnCharacter(new THREE.Vector3(0, 0.2, 0));

// =======================================
//  PointerLockControls 세팅
// =======================================
const pointerControls = new PointerLockControls(camera, renderer.domElement);

let isPointerMode = false;
const keys = {
  KeyW: false,
  KeyA: false,
  KeyS: false,
  KeyD: false,
  Space: false,
  ShiftLeft: false,
};

pointerControls.addEventListener("lock", () => {
  isPointerMode = true;
});
pointerControls.addEventListener("unlock", () => {
  isPointerMode = false;
});

// F 키로 토글
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyF") {
    if (isPointerMode) pointerControls.unlock();
    else pointerControls.lock();
    return;
  }

  // 포인터 모드에서만 WASD/Space/Shift 입력 처리
  if (isPointerMode && keys[e.code] !== undefined) {
    keys[e.code] = true;
  }

  // 포인터 모드에서는 C 키도 무시
  if (isPointerMode && e.code === "KeyC") {
    e.preventDefault();
    return;
  }
});

window.addEventListener("keyup", (e) => {
  if (isPointerMode && keys[e.code] !== undefined) {
    keys[e.code] = false;
  }
});

// =======================================
//  이벤트 핸들러: 드래그→발사, C 키 전환
// =======================================
window.addEventListener("keydown", (e) => {
  if (isPointerMode) return;
  if (e.key.toLowerCase() === "c") {
    cameraMode = cameraMode === "side" ? "front" : "side";
    canLaunch = cameraMode === "side";
    console.log("Camera mode:", cameraMode);
  }
});

window.addEventListener("mousedown", (e) => {
  if (isPointerMode) return;
  if (cameraMode === "front" || cameraMode === "side") {
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    if (cameraMode === "side" && trajectoryLine) {
      scene.remove(trajectoryLine);
      trajectoryLine = null;
    }
  }
});

window.addEventListener("mousemove", (e) => {
  if (isPointerMode || !isDragging) return;
  const dx = dragStart.x - e.clientX;
  const dy = dragStart.y - e.clientY;
  if (cameraMode === "front") {
    const angle = dx * 0.005;
    directionVec.set(Math.sin(angle), 0, -Math.cos(angle));
    updateDirectionLine();
    launchPower = dx * 0.01;
  } else if (cameraMode === "side") {
    launchHeight = dy * 0.01;
    launchPower = dx * 0.01;
    const speed = 8;
    const vx = directionVec.x * launchPower * speed;
    const vy = launchHeight * speed;
    const vz = directionVec.z * launchPower * speed;
    const v = new THREE.Vector3(vx, vy, vz);
    if (trajectoryLine) scene.remove(trajectoryLine);
    trajectoryLine = createTrajectoryLine(new THREE.Vector3(0, 1, 3), v);
    scene.add(trajectoryLine);
  }
});

window.addEventListener("mouseup", (e) => {
  if (isPointerMode) return;
  if (!isDragging) return;
  isDragging = false;
  if (cameraMode === "side" && canLaunch) {
    const dy = dragStart.y - e.clientY;
    launchHeight = dy * 0.01;
    launchReady = true;
    canLaunch = false;
  }
});

// =======================================
//  animate 함수: 물리 업데이트 + 카메라/렌더링
// =======================================
function animate() {
  requestAnimationFrame(animate);

  // 물리 엔진 스텝
  const dt = clock.getDelta();
  world.step(1 / 60, dt);

  // 메쉬와 바디 동기화
  ballMesh.position.copy(ballBody.position);
  ballMesh.quaternion.copy(ballBody.quaternion);
  boxes.forEach((b) => {
    b.mesh.position.copy(b.body.position);
    b.mesh.quaternion.copy(b.body.quaternion);
  });
  characters.forEach(({ mesh, body }) => {
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
  });

  // ── 포인터락 모드: WASD/Space/Shift로 이동 ──
  if (isPointerMode) {
    if (keys.KeyW) pointerControls.moveForward(20 * dt);
    if (keys.KeyS) pointerControls.moveForward(-20 * dt);
    if (keys.KeyA) pointerControls.moveRight(-20 * dt);
    if (keys.KeyD) pointerControls.moveRight(20 * dt);
    if (keys.Space) camera.translateY(20 * dt);
    if (keys.ShiftLeft) camera.translateY(-20 * dt);
  }
  // ── 드래그/발사 모드: 원래 카메라 로직 ──
  else {
    if (cameraMode === "side") {
      camera.position.set(10, 2, 0);
      camera.lookAt(0, 1, 0);

      if (launchReady) {
        const speed = 8;
        const vx = directionVec.x * launchPower * speed;
        const vz = directionVec.z * launchPower * speed;
        const vy = launchHeight * speed;
        ballBody.velocity.set(vx, vy, vz);
        ballBody.angularVelocity.setZero();
        ballBody.position.set(0, 1, 3);
        launchReady = false;
      }

      const v = new THREE.Vector3(
        directionVec.x * launchPower * 8,
        launchHeight * 8,
        directionVec.z * launchPower * 8
      );
      if (trajectoryLine) scene.remove(trajectoryLine);
      trajectoryLine = createTrajectoryLine(new THREE.Vector3(0, 1, 3), v);
      scene.add(trajectoryLine);
    } else {
      const camOffset = new THREE.Vector3(0, 1.5, 4);
      camera.position.copy(ballMesh.position).add(camOffset);
      const lookTarget = ballMesh.position.clone().add(directionVec);
      camera.lookAt(lookTarget);
      if (trajectoryLine) {
        scene.remove(trajectoryLine);
        trajectoryLine = null;
      }
    }
  }

  // 라벨 업데이트
  axisLabels.forEach(({ div, position }) => {
    const pos = position.clone().project(camera);
    div.style.left = `${(pos.x * 0.5 + 0.5) * window.innerWidth}px`;
    div.style.top = `${(-pos.y * 0.5 + 0.5) * window.innerHeight}px`;
  });

  renderer.render(scene, camera);
}

animate();

function createBox({ width, height, depth, position, mass = 1 }) {
  const geo = new THREE.BoxGeometry(width, height, depth);
  const mat = new THREE.MeshStandardMaterial({ color: 0x88ccff });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  const shape = new CANNON.Box(
    new CANNON.Vec3(width / 2, height / 2, depth / 2)
  );
  const body = new CANNON.Body({ mass, shape });
  body.position.copy(position);
  world.addBody(body);
  return { mesh, body };
}

function createTrajectoryLine(start, velocity, steps = 50, stepTime = 0.1) {
  const pts = [];
  const g = new THREE.Vector3(0, -9.82, 0);
  for (let i = 0; i < steps; i++) {
    const t = i * stepTime;
    const p = new THREE.Vector3()
      .copy(start)
      .add(velocity.clone().multiplyScalar(t))
      .add(g.clone().multiplyScalar(0.5 * t * t));
    pts.push(p);
  }
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: 0x00ff00 });
  return new THREE.Line(geom, mat);
}