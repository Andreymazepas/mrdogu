import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import GUI from 'lil-gui';
import * as CANNON from 'cannon-es';
import {
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
} from 'postprocessing';
import { RGBELoader } from 'three/examples/jsm/Addons.js';

const gui = new GUI();
gui.add(
  {
    'reset mr.dogu': () => {
      doguBody.position.set(0, 2, 0);
      doguBody.velocity.set(0, 0, 0);
      doguBody.angularVelocity.set(0, 0, 0);
      doguBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 0), 0);
    },
  },
  'reset mr.dogu'
);
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};
const canvas = document.querySelector('canvas.webgl');
const scene = new THREE.Scene();

const renderer = new THREE.WebGLRenderer({
  canvas: canvas,
  powerPreference: 'high-performance',
  antialias: false,
  stencil: false,
  depth: false,
});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

let movementPlane;
let clickMarker;
let raycaster;

let jointBody;
let jointConstraint;

let isDragging = false;
let isHovering = false;

const glbLoader = new GLTFLoader();

const hdrLoader = new RGBELoader();
const generator = new THREE.PMREMGenerator(renderer);
let environmentMapTexture;
hdrLoader.load('/textures/studio.hdr', (texture) => {
  environmentMapTexture = generator.fromEquirectangular(texture).texture;
  generator.dispose();
  scene.environment = environmentMapTexture;
  scene.background = environmentMapTexture;
  scene.backgroundBlurriness = 0.05;
});

let dogu;

glbLoader.load('/dogu.glb', (gltf) => {
  dogu = gltf.scene.children[0];
  dogu.position.set(2, 0, 0);
  dogu.geometry.translate(0, -0.18, 0);

  dogu.castShadow = true;
  dogu.material.environmentMapTexture = environmentMapTexture;
  dogu.material.envMapIntensity = 0.5;
  dogu.scale.set(3, 3, 3);

  scene.add(dogu);
});

glbLoader.load('/table/small_wooden_table_01_2k.gltf', (gltf) => {
  const table = gltf.scene.children[0];
  table.position.set(0, -8, 0);
  table.scale.set(15, 15, 15);
  table.receiveShadow = true;
  table.material.environmentMapTexture = environmentMapTexture;
  scene.add(table);
});

const world = new CANNON.World();
world.gravity.set(0, -18, 0);
world.allowSleep = true;

const markerGeometry = new THREE.SphereGeometry(0.1, 32, 32);
const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xddddff });
clickMarker = new THREE.Mesh(markerGeometry, markerMaterial);
clickMarker.visible = false;
scene.add(clickMarker);

const planeGeometry = new THREE.PlaneGeometry(100, 100);
movementPlane = new THREE.Mesh(planeGeometry, new THREE.MeshBasicMaterial());
movementPlane.visible = false;
scene.add(movementPlane);

const jointShape = new CANNON.Sphere(0.1);
jointBody = new CANNON.Body({ mass: 0 });
jointBody.addShape(jointShape);
jointBody.collisionFilterGroup = 0;
jointBody.collisionFilterMask = 0;
world.addBody(jointBody);

const floorShape = new CANNON.Box(new CANNON.Vec3(7, 3.25, 0.1));
const floorBody = new CANNON.Body();
floorBody.mass = 0;
floorBody.addShape(floorShape);
floorBody.position.set(0, -0.15, 0);
floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(-1, 0, 0), Math.PI * 0.5);
world.addBody(floorBody);

const concreteMaterial = new CANNON.Material('concrete');

floorBody.material = concreteMaterial;

const defaultMaterial = new CANNON.Material('default');
const defaultContactMaterial = new CANNON.ContactMaterial(
  defaultMaterial,
  concreteMaterial,
  {
    friction: 0.1,
    restitution: 0.5,
  }
);
world.addContactMaterial(defaultContactMaterial);
world.defaultContactMaterial = defaultContactMaterial;

const sphereBaseSize = 0.5;
const cylinderTopRadius = 0.5;
const cylinderTopHeight = 1;

const doguBaseShape = new CANNON.Sphere(sphereBaseSize);
const doguTopShape = new CANNON.Cylinder(
  cylinderTopRadius - 0.4,
  cylinderTopRadius,
  cylinderTopHeight,
  32
);

const doguBody = new CANNON.Body({
  mass: 1,
  position: new CANNON.Vec3(0, 2, 0),
});

doguBody.addShape(doguBaseShape, new CANNON.Vec3(0, 0, 0));
doguBody.addShape(doguTopShape, new CANNON.Vec3(0, 0.1, 0));

world.addBody(doguBody);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.set(1024, 1024);
directionalLight.shadow.camera.far = 15;
directionalLight.shadow.camera.left = -7;
directionalLight.shadow.camera.top = 7;
directionalLight.shadow.camera.right = 7;
directionalLight.shadow.camera.bottom = -7;
directionalLight.position.set(0, 5, 5);
scene.add(directionalLight);

window.addEventListener('resize', () => {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

const camera = new THREE.PerspectiveCamera(
  75,
  sizes.width / sizes.height,
  0.1,
  100
);
camera.position.set(0, 3, 5);
scene.add(camera);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 2, 0);
controls.enableDamping = true;
controls.maxAzimuthAngle = Math.PI * 0.5;
controls.maxPolarAngle = Math.PI * 0.6;
controls.minPolarAngle = Math.PI * 0.15;
controls.maxDistance = 7;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(
  new EffectPass(
    camera,
    new ToneMappingEffect({
      blendFunction: THREE.AdditiveBlending,
      adaptive: true,
      resolution: 256,
      middleGrey: 0.9,
      maxLuminance: 16.0,
      averageLuminance: 1.0,
      adaptationRate: 1.0,
    })
  )
);

window.addEventListener('pointerdown', (event) => {
  const hitPoint = getHitPoint(event.clientX, event.clientY, dogu, camera);

  if (!hitPoint) {
    return;
  }

  showClickMarker();
  moveClickMarker(hitPoint);
  moveMovementPlane(hitPoint, camera);
  addJointConstraint(hitPoint, doguBody);
  requestAnimationFrame(() => {
    isDragging = true;
  });
});

window.addEventListener('pointermove', (event) => {
  const hitPointDogu = getHitPoint(event.clientX, event.clientY, dogu, camera);

  isHovering = !!hitPointDogu;

  if (!isDragging) {
    return;
  }
  const hitPoint = getHitPoint(
    event.clientX,
    event.clientY,
    movementPlane,
    camera
  );

  if (hitPoint) {
    moveClickMarker(hitPoint);
    moveJoint(hitPoint);
  }
});

const hitSound = new Audio('/sounds/hit.mp3');
const playHitSound = (collision) => {
  const impactStrength = collision.contact.getImpactVelocityAlongNormal();

  if (impactStrength > 1) {
    hitSound.volume = Math.random();
    hitSound.currentTime = 0;
    hitSound.play();
  }
};
doguBody.addEventListener('collide', playHitSound);

window.addEventListener('pointerup', () => {
  isDragging = false;
  hideClickMarker();
  removeJointConstraint();
});

function showClickMarker() {
  clickMarker.visible = true;
}

function moveClickMarker(position) {
  clickMarker.position.copy(position);
}

function hideClickMarker() {
  clickMarker.visible = false;
}

function moveMovementPlane(point, camera) {
  movementPlane.position.copy(point);
  movementPlane.quaternion.copy(camera.quaternion);
}
raycaster = new THREE.Raycaster();

function getHitPoint(clientX, clientY, mesh, camera) {
  const mouse = new THREE.Vector2();
  mouse.x = (clientX / window.innerWidth) * 2 - 1;
  mouse.y = -((clientY / window.innerHeight) * 2 - 1);

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(mesh);

  return hits.length > 0 ? hits[0].point : undefined;
}

function addJointConstraint(position, constrainedBody) {
  const vector = new CANNON.Vec3()
    .copy(position)
    .vsub(constrainedBody.position);

  const antiRotation = constrainedBody.quaternion.inverse();
  const pivot = antiRotation.vmult(vector); // pivot is not in local body coordinates

  jointBody.position.copy(position);

  jointConstraint = new CANNON.PointToPointConstraint(
    constrainedBody,
    pivot,
    jointBody,
    new CANNON.Vec3(0, 0, 0)
  );

  world.addConstraint(jointConstraint);
}

function moveJoint(position) {
  jointBody.position.copy(position);
  jointConstraint.update();
}

function removeJointConstraint() {
  world.removeConstraint(jointConstraint);
  jointConstraint = undefined;
}

const clock = new THREE.Clock();
let oldElapsedTime = 0;

const tick = () => {
  const elapsedTime = clock.getElapsedTime();
  const deltaTime = elapsedTime - oldElapsedTime;
  oldElapsedTime = elapsedTime;
  if (isHovering) {
    window.document.body.style.cursor = 'grab';
  }

  if (isDragging) {
    controls.enabled = false;
    window.document.body.style.cursor = 'grabbing';
  } else {
    controls.enabled = true;
    controls.update();
  }

  if (!isDragging && !isHovering) {
    window.document.body.style.cursor = 'auto';
  }
  world.step(1 / 60, deltaTime, 1);

  if (dogu) {
    dogu.position.copy(doguBody.position);
    dogu.quaternion.copy(doguBody.quaternion);
  }

  composer.render();
  window.requestAnimationFrame(tick);
};

tick();
