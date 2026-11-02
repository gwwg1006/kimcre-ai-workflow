/**
 * 김명규크리에이티브 작업관리 시스템 - 3D STL 웹 뷰어
 */

let stlScene, stlCamera, stlRenderer, stlControls, currentMesh;
let animationFrameId = null;

function initSTLViewer() {
    const container = document.getElementById('stl-canvas-container');
    if (!container) return;

    // Clean previous renderer if exists
    while (container.firstChild) {
        if (container.firstChild.id === 'stl-loading-spinner') {
            break;
        }
        container.removeChild(container.firstChild);
    }

    const width = container.clientWidth || 700;
    const height = container.clientHeight || 450;

    // 1. Scene
    stlScene = new THREE.Scene();
    stlScene.background = new THREE.Color(0x0f172a);

    // 2. Camera
    stlCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    stlCamera.position.set(0, -150, 100);
    stlCamera.up.set(0, 0, 1); // Z-up for 3D printing coordinates

    // 3. Renderer
    stlRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    stlRenderer.setSize(width, height);
    stlRenderer.setPixelRatio(window.devicePixelRatio);
    stlRenderer.shadowMap.enabled = true;
    container.appendChild(stlRenderer.domElement);

    // 4. Controls
    if (typeof THREE.OrbitControls !== 'undefined') {
        stlControls = new THREE.OrbitControls(stlCamera, stlRenderer.domElement);
        stlControls.enableDamping = true;
        stlControls.dampingFactor = 0.05;
    }

    // 5. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    stlScene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(100, 100, 200);
    stlScene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.4);
    dirLight2.position.set(-100, -100, -50);
    stlScene.add(dirLight2);

    // 6. Grid Bed (256x256mm standard 3D printer bed)
    const grid = new THREE.GridHelper(250, 25, 0x38bdf8, 0x334155);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.1;
    stlScene.add(grid);

    // Animate loop
    function animate() {
        animationFrameId = requestAnimationFrame(animate);
        if (stlControls) stlControls.update();
        stlRenderer.render(stlScene, stlCamera);
    }
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animate();

    window.addEventListener('resize', () => {
        if (!container || !stlCamera || !stlRenderer) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        stlCamera.aspect = w / h;
        stlCamera.updateProjectionMatrix();
        stlRenderer.setSize(w, h);
    });
}

function loadSTLModel(fileUrl, filename) {
    const spinner = document.getElementById('stl-loading-spinner');
    if (spinner) spinner.style.display = 'flex';

    if (!stlScene) {
        initSTLViewer();
    }

    // Remove existing model mesh
    if (currentMesh) {
        stlScene.remove(currentMesh);
        if (currentMesh.geometry) currentMesh.geometry.dispose();
        if (currentMesh.material) currentMesh.material.dispose();
        currentMesh = null;
    }

    const loader = new THREE.STLLoader();
    loader.load(fileUrl, function (geometry) {
        // Material with sleek metallic 3D printing aesthetic
        const material = new THREE.MeshPhongMaterial({
            color: 0x38bdf8,
            specular: 0x111111,
            shininess: 80,
            flatShading: false
        });

        currentMesh = new THREE.Mesh(geometry, material);
        geometry.computeBoundingBox();
        const bbox = geometry.boundingBox;
        
        // Center the geometry
        const center = new THREE.Vector3();
        bbox.getCenter(center);
        geometry.center();

        // Place on bed
        const size = new THREE.Vector3();
        bbox.getSize(size);
        currentMesh.position.z = size.z / 2;

        stlScene.add(currentMesh);

        // Adjust Camera position to frame object
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = stlCamera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.8;
        cameraZ = Math.max(cameraZ, 80);

        stlCamera.position.set(0, -cameraZ, cameraZ * 0.8);
        stlCamera.lookAt(0, 0, size.z / 2);
        if (stlControls) {
            stlControls.target.set(0, 0, size.z / 2);
            stlControls.update();
        }

        if (spinner) spinner.style.display = 'none';
    }, undefined, function (error) {
        console.error('Error loading STL:', error);
        if (spinner) {
            spinner.innerHTML = '<span class="text-danger"><i class="fa-solid fa-triangle-exclamation"></i> STL 파일을 불러오지 못했습니다.</span>';
        }
    });
}

function resetSTLCamera() {
    if (!stlCamera || !currentMesh) return;
    const geometry = currentMesh.geometry;
    const bbox = geometry.boundingBox;
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = stlCamera.fov * (Math.PI / 180);
    const cameraZ = Math.max(Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.8, 80);

    stlCamera.position.set(0, -cameraZ, cameraZ * 0.8);
    stlCamera.lookAt(0, 0, size.z / 2);
    if (stlControls) {
        stlControls.target.set(0, 0, size.z / 2);
        stlControls.update();
    }
}
