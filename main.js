import * as THREE from "three";
import * as CANNON from "cannon-es";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

const DEV_MODE = false;
let selectedStage = null;
let showLogo = false;

const stageOverlay = document.getElementById("stage-overlay");
const logoOverlay = document.getElementById("logo-overlay");
const elCurrentStage = document.getElementById("current-stage");
const btnResetStage = document.getElementById("reset-stage");
const stageBtns = document.querySelectorAll(".stage-btn");
const elThrowCount = document.getElementById("throw-count");
const elBestScorePanel = document.getElementById("best-score-panel");
const elCharacterCount = document.getElementById("char-count");
const controlPanel = document.getElementById("control-panel");
const logoPanel = document.getElementById("logo-panel");
const modePanel = document.getElementById("mode-panel");
const btnModeF = document.getElementById("btn-mode-f");
const btnModeC = document.getElementById("btn-mode-c");
const modeLabel = document.getElementById("mode-label");
const btnModeHelp = document.getElementById("btn-mode-help");
const modalOverlay = document.getElementById("mode-modal");
const btnModalClose = document.getElementById("btn-modal-close");

let throwCount = 0;
let scoreCount = 0;
let trajectoryLine = null;
let cameraMode = "front"; // front: 정면(조준), side: 측면(발사), anim: 애니메이션
const initialFrontPos = new THREE.Vector3(0, 2, 5);
const initialFrontTarget = new THREE.Vector3(0, 1, 0);
const initialBallPos = new THREE.Vector3(0, 0.2, 3);
let isDragging = false;
let dragStart = null;
let launchReady = false;
let launchPower = 0;
let launchHeight = 0;
let canLaunch = false;
let mixer = null;
let cameraMovementSpeed = 10;
let pigpath = "./models/characters/pig.glb";
let kingpigpath = "./models/characters/Kingpig.glb";
let helmetpigpath = "./models/characters/Helmetpig.glb";

let gameStart = DEV_MODE;
let playAnime = DEV_MODE;
let timer = 0;
let gltfAnimations = [];

let clouds = []; // 구름 모델들을 저장할 배열
const cloud1Path = "./models/backgrounds/cloud1.glb";
const cloud2Path = "./models/backgrounds/cloud2.glb";

let WAIT_AFTER_THROW = 3000; // 던진 후 대기 시간 (ms)
const GLASS_BREAK_THRESHOLD = 3.5;
const debrisList = [];
const DEBRIS_COUNT = 30; // 잔해 개수
const DEBRIS_LIFETIME = 1.5; // 초 단위
const GRAVITY = new THREE.Vector3(0, -9.82, 0);
const bodiesToRemove = [];

document.querySelectorAll("#stage-buttons button").forEach((btn) => {
  btn.addEventListener("click", () => {
    selectedStage = Number(btn.dataset.stage);
    stageOverlay.style.display = "none";
    initStage(selectedStage);

    // 애니메이션 씬
    timer = 0;
    playAnime = true;

    elCurrentStage.textContent = selectedStage;
  });
});

function updateModeUI() {
  btnModeF.classList.toggle("active", isPointerMode);
  btnModeC.classList.toggle("active", !isPointerMode);
  modeLabel.textContent = isPointerMode
    ? "FPS"
    : cameraMode === "side"
    ? "Throw"
    : "Angle";
}

btnModeHelp.addEventListener("click", () => {
  modalOverlay.style.display = "flex";
});
btnModalClose.addEventListener("click", () => {
  modalOverlay.style.display = "none";
});
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) modalOverlay.style.display = "none";
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Escape") {
    // 모달이 켜져 있으면 끄기
    if (modalOverlay.style.display === "flex") {
      modalOverlay.style.display = "none";
    }
    // 포인터락 모드라면 해제
    if (isPointerMode) {
      pointerControls.unlock();
    }
  }
});

stageBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const s = Number(btn.dataset.stage);
    stageBtns.forEach((b) => {
      const isSelected = Number(b.dataset.stage) === s;
      b.classList.toggle("selected", isSelected);
      console.log("Button", b.dataset.stage, "selected:", isSelected);

      b.disabled = isSelected;
    });
    elCurrentStage.textContent = s;
    stageBtns.forEach((b) => b.classList.toggle("selected", b === btn));
    selectedStage = s;
    initStage(selectedStage);
    launchReady = false;
    canLaunch = false;
    launchPower = 0;
    launchHeight = 0;

    if (trajectoryLine) {
      scene.remove(trajectoryLine);
      trajectoryLine = null;
    }

    cameraMode = "front";
    directionVec.set(0, 0, -1);
    updateDirectionLine();
    camera.position.copy(initialFrontPos);
    camera.lookAt(initialFrontTarget);
    animTimer = 0;
    playAnime = !DEV_MODE;
    showLogo = false;
    timer = 0;
    gameStart = !playAnime;
    if (mixer) {
      mixer.stopAllAction();
      gltfAnimations.forEach((clip) => {
        mixer.clipAction(clip).reset().play();
      });
    }
  });
});

// Reset 버튼
btnResetStage.addEventListener("click", () => {
  console.log("Reset Stage", selectedStage);
  initStage(selectedStage);

  launchReady = false;
  canLaunch = false;
  launchPower = 0;
  launchHeight = 0;

  if (trajectoryLine) {
    scene.remove(trajectoryLine);
    trajectoryLine = null;
  }

  cameraMode = "front";
  directionVec.set(0, 0, -1);
  updateDirectionLine();
  camera.position.copy(initialFrontPos);
  camera.lookAt(initialFrontTarget);
  gameStart = true;
  showLogo = false;

  // 컨트롤 패널 숨기기
  // controlPanel.style.display = "none";

  // 애니메이션 리셋 & 재생
  if (mixer) {
    mixer.stopAllAction();
    gltfAnimations.forEach((clip) => {
      mixer.clipAction(clip).reset().play();
    });
  }
});

function initStage(stageNumber) {
  timer = 0;
  throwCount = 0;
  scoreCount = 0;
  elThrowCount.textContent = `${throwCount} (${scoreCount})`;
  stageBtns[stageNumber - 1].classList.add("selected");
  updateBestScoreDisplay();

  boxes.forEach(({ mesh, body }) => {
    scene.remove(mesh);
    world.removeBody(body);
  });
  boxes.length = 0;

  characters.forEach(({ mesh, body }) => {
    scene.remove(mesh);
    world.removeBody(body);
  });
  characters.length = 0;

  debrisList.forEach(({ mesh }) => {
    scene.remove(mesh);
  });
  debrisList.length = 0;

  // 기존 구름 제거
  clouds.forEach((mesh) => {
    scene.remove(mesh);
  });
  clouds.length = 0;

  ballBody.position.copy(initialBallPos);
  ballBody.velocity.setZero();
  ballBody.angularVelocity.setZero();
  ballBody.quaternion.set(0, 0, 0, 1);
  ballMesh.position.copy(initialBallPos);

  var fp;
  if (stageNumber == 1) {
    fp = new String("./models/buildings/Wall.glb");
  } else if (stageNumber == 2) {
    fp = new String("./models/buildings/Pot.glb");
  } else if (stageNumber == 3) {
    fp = new String("./models/buildings/GlassTower.glb");
  } else {
    fp = new String("./models/buildings/House.glb");
  }
  loader.load(fp, (gltf) => {
    gltf.scene.traverse((child) => {
      if (child.isMesh) {
        const material = child.material;
        const matName = material.name || "defaultMat";
        const isGlass = matName.includes("Glass");

        const mesh = child.clone();
        mesh.geometry.computeBoundingBox();
        mesh.castShadow = true;
        scene.add(mesh);

        const worldBBox = new THREE.Box3().setFromObject(mesh);
        const size = worldBBox.getSize(new THREE.Vector3());
        const halfExtents = new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2);
        const shape = new CANNON.Box(halfExtents);

        let mass = 1;
        if (matName.includes("Stone")) {
          mass = 3;
        } else if (matName.includes("Wood")) {
          mass = 1;
        } else if (matName.includes("Glass")) {
          mass = 0.5;
        }
        const defaultMat = world.defaultMaterial;
        const body = new CANNON.Body({ mass: mass, shape });
        body.material = defaultMat;
        body.position.copy(mesh.getWorldPosition(new THREE.Vector3()));
        body.quaternion.copy(mesh.getWorldQuaternion(new THREE.Quaternion()));
        world.addBody(body);

        boxes.push({ mesh, body });
        if (isGlass) {
          body.addEventListener("collide", (event) => {
            const impact = event.contact.getImpactVelocityAlongNormal?.() || 0;
            if (impact <= GLASS_BREAK_THRESHOLD) return;
            setTimeout(() => {
              scene.remove(mesh);
              bodiesToRemove.push(body);

              const originalMat = child.material;
              const originalMap = originalMat.map;
              const originalEnv = originalMat.envMap;

              const bbox = new THREE.Box3().setFromObject(child);
              const size = bbox.getSize(new THREE.Vector3());
              const min = bbox.min;

              for (let i = 0; i < DEBRIS_COUNT; i++) {
                const r = Math.random() * 0.02 + 0.01;
                const geom = new THREE.SphereGeometry(r, 6, 6);
                const mat = new THREE.MeshStandardMaterial({
                  map: originalMap,
                  envMap: originalEnv,
                  transparent: true,
                  opacity: 1,
                  roughness: originalMat.roughness ?? 0.1,
                  metalness: originalMat.metalness ?? 0,
                });
                const dm = new THREE.Mesh(geom, mat);

                dm.position.set(
                  min.x + Math.random() * size.x,
                  min.y + Math.random() * size.y,
                  min.z + Math.random() * size.z
                );

                const vel = new THREE.Vector3(
                  (Math.random() - 0.5) * 2,
                  Math.random() * 3 + 2,
                  (Math.random() - 0.5) * 2
                );

                debrisList.push({
                  mesh: dm,
                  velocity: vel,
                  age: 0,
                });
                scene.add(dm);
              }
            }, 500);
          });
        }
      }
    });
  });

  // 구름 모델 로드 및 무작위 배치
  const numClouds = 200; // 배치할 구름의 총 개수
  const cloudSpawnArea = {
    minX: -200,
    maxX: 200, // 구름이 배치될 넓은 X 범위
    minY: 20,
    maxY: 40, // 구름이 배치될 Y 높이 범위 (하늘)
    minZ: -200,
    maxZ: 200, // 구름이 배치될 넓은 Z 범위
  };

  const loadAndPlaceClouds = (
    path,
    count,
    arrayToStore,
    minScale,
    maxScale
  ) => {
    loader.load(path, (gltf) => {
      for (let i = 0; i < count; i++) {
        const model = gltf.scene.clone();

        const x =
          Math.random() * (cloudSpawnArea.maxX - cloudSpawnArea.minX) +
          cloudSpawnArea.minX;
        const y =
          Math.random() * (cloudSpawnArea.maxY - cloudSpawnArea.minY) +
          cloudSpawnArea.minY;
        const z =
          Math.random() * (cloudSpawnArea.maxZ - cloudSpawnArea.minZ) +
          cloudSpawnArea.minZ;

        model.position.set(x, y, z);

        const scale = minScale + Math.random() * (maxScale - minScale);
        model.scale.set(scale, scale, scale);
        model.rotation.y = Math.random() * Math.PI * 2; // 무작위 Y축 회전

        scene.add(model);
        arrayToStore.push(model);
      }
    });
  };

  // cloud1.glb 와 cloud2.glb 를 각각 10개씩 배치 (총 20개)
  // minScale과 maxScale을 조절하여 구름의 크기 범위를 설정합니다.
  loadAndPlaceClouds(cloud1Path, numClouds / 10, clouds, 2.5, 3.5); // 첫 번째 구름 모델
  loadAndPlaceClouds(cloud2Path, numClouds, clouds, 2.5, 4); // 두 번째 구름 모델

  spawnCharacter(pigpath, new THREE.Vector3(0, 0, 0), 2);
  spawnCharacter(helmetpigpath, new THREE.Vector3(2, 0, 0), 2);
  spawnCharacter(kingpigpath, new THREE.Vector3(4, 0, 0), 2);
}

function getBestScore(stage) {
  const v = localStorage.getItem(`stage${stage}Best`);
  return v !== null ? Number(v) : Infinity;
}

function saveBestScore(stage, score) {
  const prev = getBestScore(stage);
  if (score < prev) {
    localStorage.setItem(`stage${stage}Best`, score);
  }
}

function updateBestScoreDisplay() {
  const best = getBestScore(selectedStage);
  const text = best === Infinity ? "–" : best;
  // Control Panel
  elBestScorePanel.textContent = text;
  // Overlay
  document.querySelectorAll("#stage-buttons button").forEach((btn) => {
    const s = Number(btn.dataset.stage);
    const span = btn.querySelector(".overlay-best");
    if (span) {
      const b = getBestScore(s);
      span.textContent = b === Infinity ? "–" : b;
    }
  });
}

// 방향 벡터 저장
let directionVec = new THREE.Vector3(0, 0, -1);

// === 씬, 카메라, 렌더러 ===
const scene = new THREE.Scene();
const animScene = new THREE.Scene();
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
const animLight = new THREE.DirectionalLight(0xffffff, 1);
animLight.position.set(5, 10, 5);
animScene.add(animLight);

// === 물리 world ===
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });

// === 바닥 ===
const textureLoader = new THREE.TextureLoader();
const grassDiffuseMap = textureLoader.load(
  "./models/backgrounds/grassDiffuse.jpg"
);
const grassBumpMap = textureLoader.load("./models/backgrounds/grassBump.jpg");
const grassNormalMap = textureLoader.load(
  "./models/backgrounds/grassNormal.jpg"
);

// 텍스처 반복 설정
grassDiffuseMap.wrapS = THREE.RepeatWrapping;
grassDiffuseMap.wrapT = THREE.RepeatWrapping;
grassDiffuseMap.repeat.set(50, 50);

grassBumpMap.wrapS = THREE.RepeatWrapping;
grassBumpMap.wrapT = THREE.RepeatWrapping;
grassBumpMap.repeat.set(50, 50);

grassNormalMap.wrapS = THREE.RepeatWrapping;
grassNormalMap.wrapT = THREE.RepeatWrapping;
grassNormalMap.repeat.set(50, 50);

const floorGeo = new THREE.BoxGeometry(400, 0.1, 400);

const floorMat = new THREE.MeshStandardMaterial({
  map: grassDiffuseMap,
  bumpMap: grassBumpMap,
  bumpScale: 0.5,
  normalMap: grassNormalMap,
  normalScale: new THREE.Vector2(1, 1),
});
const floorMesh = new THREE.Mesh(floorGeo, floorMat);
floorMesh.position.set(0, -0.05, 0);
floorMesh.receiveShadow = true;
const animFloorMesh = floorMesh.clone();

scene.add(floorMesh);
animScene.add(animFloorMesh);
const floorBody = new CANNON.Body({
  type: CANNON.Body.STATIC,
  shape: new CANNON.Box(new CANNON.Vec3(100, 0.1, 100)),
  position: new CANNON.Vec3(0, -0.1, 0),
  material: new CANNON.Material("floorMat"),
});
world.addBody(floorBody);

// 배경
scene.background = new THREE.Color(0x87ceeb);
animScene.background = new THREE.Color(0x87ceeb);

// === 구조물: GLTF 모델 로딩 ===
const boxes = [];
const loader = new GLTFLoader();

// 추가조명
const ambient = new THREE.AmbientLight(0xffffff, 1.0);
const animAmbient = new THREE.AmbientLight(0xffffff, 1.0);
scene.add(ambient);
animScene.add(animAmbient);

// === 구조물: Blender Animation GLB 모델 로딩
const loaderAnim = new GLTFLoader();
loader.load("./models/buildings/animations/WallAnime.glb", (gltf) => {
  // 애니메이션 관련
  loaderAnim.load("./models/buildings/animations/WallAnime.glb", (gltf) => {
    console.log("GLTF loaded:", gltf);
    const model = gltf.scene;
    animScene.add(model);
    mixer = new THREE.AnimationMixer(model);
    gltfAnimations = gltf.animations;
    if (!playAnime) {
      gltfAnimations.forEach((clip) => {
        mixer.clipAction(clip).play();
      });
    }
  });
});

let birdMesh;
// === Bird 모델 로드 ===
loader.load("./models/characters/Bird.glb", (gltf) => {
  birdMesh = gltf.scene;
  birdMesh.scale.set(0.15, 0.15, 0.15); // 새 모델의 크기 조절
  scene.add(birdMesh);

  birdMesh.position.set(0, -0.2, 0);
  birdMesh.rotation.y = -Math.PI;

  ballMesh.add(birdMesh); // ballMesh의 자식으로 birdMesh 추가
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
function onBallLaunched() {
  throwCount += 1;
  if (charCount > 0) {
    scoreCount++;
  }
  elThrowCount.textContent = `${throwCount} (${scoreCount})`;
}

// === 캐릭터 관리 ===
const characters = [];
let charCount = 0;

const charMaterial = new CANNON.Material("charMat");
const defaultMat = world.defaultMaterial;
const charDefaultContact = new CANNON.ContactMaterial(
  charMaterial,
  defaultMat,
  {
    friction: 1,
    restitution: 0,
  }
);
const charFloorContact = new CANNON.ContactMaterial(
  charMaterial,
  floorBody.material,
  {
    friction: 10,
    restitution: 0.0,
  }
);
world.addContactMaterial(charFloorContact);
world.addContactMaterial(charDefaultContact);
world.solver.iterations = 200;
world.solver.tolerance = 0;

function updateCharCount() {
  elCharacterCount.textContent = charCount;
  if (charCount === 0) {
    saveBestScore(selectedStage, scoreCount);
    updateBestScoreDisplay();
  }
}

function spawnCharacter(name, position, scale) {
  let hasDied = false;
  // 모델 파일 경로 결정
  let sizeconstant = scale;
  let size = 0.0;
  if (name == pigpath) {
    size = 0.2 * sizeconstant;
  } else if (name == helmetpigpath) {
    size = 0.2 * sizeconstant;
  } else if (name == kingpigpath) {
    size = 0.33 * sizeconstant;
  }

  // 1) 구체 메쉬 생성
  const geo = new THREE.SphereGeometry(size);
  const mat = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(position);
  scene.add(mesh);

  // 2) 물리 바디 생성
  const body = new CANNON.Body({
    mass: 1,
    shape: new CANNON.Sphere(size),
    position: new CANNON.Vec3(position.x, position.y + size, position.z),
    material: charMaterial,
  });
  body.linearDamping = 0.4;
  body.angularDamping = 0.4;
  world.addBody(body);

  // 3) 충돌 이벤트 처리 (기존 로직 유지)
  body.addEventListener("collide", (event) => {
    if (hasDied) return; // 이미 죽은 경우 무시
    const impact = event.contact.getImpactVelocityAlongNormal();
    console.log(impact);
    if (
      Math.abs(impact) >
      DEATH_THRESHOLD[name == pigpath ? 0 : name == helmetpigpath ? 1 : 2]
    ) {
      hasDied = true; // 죽음 상태로 설정
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

  // 4) 모델 로드 및 처리

  if (name == pigpath) {
    loader.load(pigpath, (gltf) => {
      const pigRoot = gltf.scene;
      mesh.add(pigRoot);

      // 위치/스케일 보정
      pigRoot.position.set(0, (-1 * size) / 11.0, 0);
      pigRoot.scale.set(
        0.1 * sizeconstant,
        0.1 * sizeconstant,
        0.1 * sizeconstant
      );

      // 모든 Mesh 재질 순회하면서 색상(HSL)을 밝게 보정
      pigRoot.traverse((child) => {
        if (child.isMesh && child.material) {
          // 색상의 밝기(V)를 0.1만큼 올리기
          child.material.color.offsetHSL(0, 0, 0.1);
          child.material.needsUpdate = true;
        }
      });
    });
  }

  if (name == helmetpigpath) {
    loader.load(helmetpigpath, (gltf) => {
      const pigRoot = gltf.scene;
      mesh.add(pigRoot);

      // 위치/스케일 보정
      pigRoot.position.set(0, (-1 * size) / 11.0, 0);
      pigRoot.scale.set(
        0.1 * sizeconstant,
        0.1 * sizeconstant,
        0.1 * sizeconstant
      );

      // 모든 Mesh 재질 순회하면서 색상(HSL) 밝게 보정
      pigRoot.traverse((child) => {
        if (child.isMesh && child.material) {
          // 색 밝기를 0.1 올리기
          child.material.color.offsetHSL(0, 0, 0.1);
          child.material.needsUpdate = true;
        }
      });
    });
  }

  if (name == kingpigpath) {
    loader.load(kingpigpath, (gltf) => {
      const pigRoot = gltf.scene;
      mesh.add(pigRoot);

      // 위치/스케일 보정
      pigRoot.position.set(0, (-10 * size) / 11.0, 0);
      pigRoot.scale.set(
        0.1 * sizeconstant,
        0.1 * sizeconstant,
        0.1 * sizeconstant
      );

      // 모든 Mesh 재질 순회하면서 색상(HSL) 밝게 보정
      pigRoot.traverse((child) => {
        if (child.isMesh && child.material) {
          // 색 밝기를 0.1 올리기
          child.material.color.offsetHSL(0, 0, 0.1);
          child.material.needsUpdate = true;
        }
      });

      // 수염 조정(기존코드 유지)
      const mustache = pigRoot.getObjectByName("mustache");
      if (mustache) {
        mustache.scale.set(0.01, 0.01, 0.01);
        mustache.position.x += 0.2;
      }
    });
  }

  // 5) 캐릭터 관리
  characters.push({ mesh, body });
  charCount = characters.length;
  updateCharCount();

  return mesh;
}

const DEATH_THRESHOLD = [1, 2.5, 4];

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
    if (isPointerMode) {
      pointerControls.unlock();
      updateModeUI();
    } else {
      pointerControls.lock();
      updateModeUI();
    }
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
  if (gameStart) {
    if (isPointerMode || !isDragging) return;
    const dx = dragStart.x - e.clientX;
    const dy = dragStart.y - e.clientY;
    if (cameraMode === "front") {
      const angle = dx * 0.005;
      directionVec.set(Math.sin(angle), 0, -Math.cos(angle));
      updateDirectionLine();
      launchPower = dx * 0.01;
    } else if (cameraMode === "side" && canLaunch) {
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
  }
});

window.addEventListener("mouseup", (e) => {
  if (gameStart) {
    if (isDragging) isDragging = false;
    if (cameraMode === "side" && canLaunch) {
      const dy = dragStart.y - e.clientY;
      launchHeight = dy * 0.01;
      launchReady = true;
      canLaunch = false;
      onBallLaunched();

      setTimeout(() => {
        ballBody.position.copy(initialBallPos);
        ballBody.velocity.setZero();
        ballBody.angularVelocity.setZero();
        ballBody.quaternion.set(0, 0, 0, 1);
        ballMesh.position.copy(initialBallPos);
        ballMesh.quaternion.set(0, 0, 0, 1);
        canLaunch = true;
      }, WAIT_AFTER_THROW);
    }
  }
});

// =======================================
//  animate 함수: 물리 업데이트 + 카메라/렌더링
// =======================================

let animTimer = 0;
let logoTimer = 0;
function animate() {
  requestAnimationFrame(animate);

  if (selectedStage == null) {
    controlPanel.style.display = "none";
    logoPanel.style.display = "none";
    modePanel.style.display = "none";
    return;
  }
  if (showLogo) {
    const delta = clock.getDelta();
    logoOverlay.style.display = "flex";
    logoTimer += delta;
    if (logoTimer >= 3) {
      logoOverlay.style.display = "none";
      showLogo = false;
      gameStart = true;
      logoTimer = 0; // 반드시 초 기화
    } else {
      renderer.render(scene, camera);
    }
    return;
  }

  if (!gameStart && playAnime) {
    const delta = clock.getDelta();
    animTimer += delta;
    camera.position.set(15, 13, 5);
    camera.lookAt(0, 5, -5);
    mixer?.update(delta);
    renderer.render(animScene, camera);

    if (animTimer >= 8) {
      // 정확히 8초 동안만
      logoTimer = 0; // 로고 타이머도 초기화
      playAnime = false;
      showLogo = true;
      animTimer = 0; // 반드시 초기화
    }
    return; // 애니메이션 구간 동안만 이 블록 실행
  } else if (gameStart) {
    const dt = clock.getDelta();
    world.step(1 / 60, dt);
    if (bodiesToRemove.length) {
      bodiesToRemove.forEach((b) => {
        world.removeBody(b);
      });
      bodiesToRemove.length = 0;
    }

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
      if (keys.KeyW) pointerControls.moveForward(cameraMovementSpeed * dt);
      if (keys.KeyS) pointerControls.moveForward(-cameraMovementSpeed * dt);
      if (keys.KeyA) pointerControls.moveRight(-cameraMovementSpeed * dt);
      if (keys.KeyD) pointerControls.moveRight(cameraMovementSpeed * dt);
      if (keys.Space) camera.translateY(cameraMovementSpeed * dt);
      if (keys.ShiftLeft) camera.translateY(-cameraMovementSpeed * dt);
      if (camera.position.y < 2) {
        camera.position.y = 2;
      }
      if (
        camera.position.x > 50 ||
        camera.position.x < -50 ||
        camera.position.z > 50 ||
        camera.position.z < -50 ||
        camera.position.y > 30
      ) {
        camera.position.set(
          Math.max(-50, Math.min(50, camera.position.x)),
          Math.min(30, camera.position.y),
          Math.max(-50, Math.min(50, camera.position.z))
        );
      }
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
        camera.position.copy(initialFrontPos);
        camera.lookAt(initialFrontTarget);
        if (trajectoryLine) {
          scene.remove(trajectoryLine);
          trajectoryLine = null;
        }
        updateDirectionLine();
      }
    }

    axisLabels.forEach(({ div, position }) => {
      const pos = position.clone().project(camera);
      div.style.left = `${(pos.x * 0.5 + 0.5) * window.innerWidth}px`;
      div.style.top = `${(-pos.y * 0.5 + 0.5) * window.innerHeight}px`;
    });

    for (let i = debrisList.length - 1; i >= 0; i--) {
      const d = debrisList[i];

      d.velocity.addScaledVector(GRAVITY, dt);
      d.mesh.position.addScaledVector(d.velocity, dt);

      d.age += dt;
      const t = d.age / DEBRIS_LIFETIME;
      d.mesh.material.opacity = Math.max(0, 1 - t);

      if (d.age >= DEBRIS_LIFETIME) {
        scene.remove(d.mesh);
        debrisList.splice(i, 1);
      }
    }
    controlPanel.style.display = "block";
    logoPanel.style.display = "block";
    modePanel.style.display = "flex";
    updateModeUI();

    renderer.render(scene, camera);
  }
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
