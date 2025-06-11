import * as THREE from "three";
import * as CANNON from "cannon-es";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

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
const clock = new THREE.Clock();
const renderer = new THREE.WebGLRenderer();
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
const floorGeo = new THREE.BoxGeometry(100, 0.0001, 100);
const floorMat = new THREE.MeshStandardMaterial({
  color: 0x888888,
  transparent: true,
  opacity: 0.5,
});
const floorMesh = new THREE.Mesh(floorGeo, floorMat);
scene.add(floorMesh);
let floorMesh2 = floorMesh.clone();
animScene.add(floorMesh2);
const floorBody = new CANNON.Body({
  type: CANNON.Body.STATIC,
  shape: new CANNON.Box(new CANNON.Vec3(100, 0.0001, 100)),
  position: new CANNON.Vec3(0, 0, 0),
});
world.addBody(floorBody);

<<<<<<< Updated upstream
// === 구조물: Blender-exported GLTF 모델 로딩 ===
=======
// 배경(그냥 하늘색으로)
scene.background = new THREE.Color(0x87ceeb);
animScene.background = new THREE.Color(0x87ceeb);
// === 구조물: GLTF 모델 로딩 ===
>>>>>>> Stashed changes
const boxes = [];
const loader = new GLTFLoader();
loader.load("./models/Test2.glb", (gltf) => {
  gltf.scene.traverse((child) => {
    if (child.isMesh) {
      // Three.js mesh 추가
      const mesh = child.clone();
      mesh.geometry.computeBoundingBox();
      mesh.castShadow = true;
      scene.add(mesh);

      // CANNON 바디 생성: 메쉬 바운딩박스 기반
      const worldBBox = new THREE.Box3().setFromObject(mesh);
      const size = worldBBox.getSize(new THREE.Vector3());

      // 반(extents) 로 CANNON.Box 생성
      const halfExtents = new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2);
      const shape = new CANNON.Box(halfExtents);
      const body = new CANNON.Body({ mass: 1, material: defaultMat });
      body.addShape(shape);
      body.position.copy(mesh.getWorldPosition(new THREE.Vector3()));
      body.quaternion.copy(mesh.getWorldQuaternion(new THREE.Quaternion()));
      world.addBody(body);

      // 애니메이션 루프에서 동기화
      boxes.push({ mesh, body });
    }
  });
});

<<<<<<< Updated upstream
=======
// 추가조명
const ambient = new THREE.AmbientLight(0xffffff, 1.0); // 색상, 강도(0.0~1.0)
const ambient2 = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(ambient);
animScene.add(ambient2);

// === 구조물: Blender Animation GLB 모델 로딩
const loaderAnim = new GLTFLoader();
loader.load("./models/WallAnime.glb", (gltf) => {
  //애니메이션 관련
  loaderAnim.load("./models/WallAnime.glb", (gltf) => {
    console.log("GLTF loaded:", gltf);
    const model = gltf.scene;
    animScene.add(model);
    mixer = new THREE.AnimationMixer(model);
    if (!playAnime) {
      gltf.animations.forEach((clip) => {
        mixer.clipAction(clip).play();
      });
    }
  });
});

>>>>>>> Stashed changes
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

// 캐릭터 수 UI
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
const charDefaultContact = new CANNON.ContactMaterial(
  charMaterial,
  defaultMat, // 땅/건물 등에 붙는 기본 머티리얼
  {
    friction: 1,
    restitution: 0.5,
  }
);
world.solver.iterations = 500;
world.solver.tolerance = 0.001;
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

  // 사망 처리
  body.addEventListener("collide", (event) => {
    const impact = event.contact.getImpactVelocityAlongNormal();
    console.log("Impact velocity:", impact);
    if (Math.abs(impact) > DEATH_THRESHOLD && mesh.visible) {
      setTimeout(() => {
        setTimeout(() => {
          world.removeBody(body);
          charCount = Math.max(0, charCount - 1);
          updateCharCount();
        }, 500);
        const shape = body.shapes[0];
        if (shape instanceof CANNON.Sphere) {
          shape.radius *= 1.1; // 1.1배 확대
          body.updateBoundingRadius(); // 내부적으로 boundingRadius 재계산
          body.updateMassProperties(); // 관성 갱신
        }
        mesh.visible = false;
      }, 500);
    }
  });
  characters.push({ mesh, body });
  charCount = characters.length;
  updateCharCount();
}

// 빌딩 아래에 캐릭터 한 명 배치
spawnCharacter(new THREE.Vector3(0, 0.2, 0));
spawnCharacter(new THREE.Vector3(0, 2.4, 0));

const DEATH_THRESHOLD = 0.5; // 적절히 조정

// === 이벤트 ===
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "c") {
    cameraMode = cameraMode === "side" ? "front" : "side";
    canLaunch = cameraMode === "side";
    console.log("Camera mode:", cameraMode);
  }
});
window.addEventListener("mousedown", (e) => {
  // 정면 조준 또는 측면 드래그 시작
  if (cameraMode === "front" || cameraMode === "side") {
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    // 측면 뷰에서는 초기 trajectoryLine 제거
    if (cameraMode === "side" && trajectoryLine) {
      scene.remove(trajectoryLine);
      trajectoryLine = null;
    }
  }
});
window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  const dx = dragStart.x - e.clientX;
  const dy = dragStart.y - e.clientY;
  if (cameraMode === "front") {
    // 방향 회전: Y축 기준 yaw
    const angle = dx * 0.005;
    directionVec.set(Math.sin(angle), 0, -Math.cos(angle));
    updateDirectionLine();
    launchPower = dx * 0.01;
  } else if (cameraMode === "side") {
    // 높이 및 파워 조정
    launchHeight = dy * 0.01;
    launchPower = dx * 0.01;
    // trajectory 즉시 표시
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
  if (isDragging) isDragging = false;
  if (cameraMode === "side" && canLaunch) {
    // side 뷰: 높이 및 파워 결정
    const dy = dragStart.y - e.clientY;
    launchHeight = dy * 0.01;
    launchReady = true;
    canLaunch = false;
  }
});

// === animate ===
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  world.step(1 / 60, dt);
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
    // trajectory
    const v = new THREE.Vector3(
      directionVec.x * launchPower * 8,
      launchHeight * 8,
      directionVec.z * launchPower * 8
    );
    if (trajectoryLine) scene.remove(trajectoryLine);
    trajectoryLine = createTrajectoryLine(new THREE.Vector3(0, 1, 3), v);
    scene.add(trajectoryLine);
  } else {
    // 정면 뷰: 카메라를 공 바로 뒤에 배치
    const camOffset = new THREE.Vector3(0, 1.5, 4);
    // 카메라 위치 설정
    camera.position.copy(ballMesh.position).add(camOffset);
    // cameraDirection을 반영해 시선 회전
    const lookTarget = ballMesh.position.clone().add(directionVec);
    camera.lookAt(lookTarget);
    if (trajectoryLine) {
      scene.remove(trajectoryLine);
      trajectoryLine = null;
    }
  }

  // 라벨 업데이트
  axisLabels.forEach(({ div, position }) => {
    const pos = position.clone().project(camera);
    div.style.left = `${(pos.x * 0.5 + 0.5) * window.innerWidth}px`;
    div.style.top = `${(-pos.y * 0.5 + 0.5) * window.innerHeight}px`;
  });
  renderer.render(scene, camera);
  scene, camera;
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
