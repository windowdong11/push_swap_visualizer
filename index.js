let dark_mode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
let pixel_diff = 1;
let min_val = Infinity;
let max_val = -Infinity;
let usedSet = new Set();
let usedCommandStack = [];
let execute_timeout_id = null;
let command_list = [];
let next_command_idx = 0;
let execute_order = 0;
let command_record_status = false;
const stack_a = document.getElementById('stack_a');
const stack_b = document.getElementById('stack_b');
const number_output = document.getElementById('number-output');
const commands_elem = document.getElementById('commands-output');
const interval_elem = document.getElementById('input-exec-interval');
const command_cnt_elem = document.getElementById('command_count');

const os = (() => {
	/**
	 * OS를 특정합니다.
	 * 
	 * @returns {'mac' | 'windows' | 'linux' | 'unknown'}
	 */
	function detectOS() {
		const userAgent = window.navigator.userAgent;
		if (userAgent.includes('Macintosh'))
			return 'mac';
		else if (userAgent.includes('Windows'))
			return 'windows';
		else if (userAgent.includes('Linux'))
			return 'linux';
		else
			return 'unknown';
	}
	const osType = detectOS();
	return {
		isWindows: () => osType === 'windows',
		isMac: () => osType === 'mac',
		isLinux: () => osType === 'linux',
		getOSType: () => osType,
	}
})();

/**
 * 
 * @param {string} key 
 * @param {string | null} defaultValue 
 * @returns 
 */
function loadSetting(key, defaultValue = null) {
	const value = localStorage.getItem(key);
	if (value === null)
		return defaultValue;
	return value;
}
function storeSetting(key, value) {
	localStorage.setItem(key, value);
}

// btn-darkmode 요소 선택
const darkmodeBtn = document.getElementById('btn-darkmode');

/**
 * localStorage에 다크모드를 저장합니다.
 * 
 * @param {'dark' | 'light'} mode 
 */
function setDarkMode(mode) {
	if (mode === 'dark') {
		document.querySelector('html').dataset.theme = 'dark';
		darkmodeBtn.classList.add('active');
	} else {
		document.querySelector('html').dataset.theme = 'light';
		darkmodeBtn.classList.remove('active');
	}
	storeSetting('pushswap_darkmode', mode);
	dark_mode = mode === 'dark';
	recalculateAll();
}

/**
 * localStorage에서 다크모드를 가져옵니다.
 * 
 * @returns {boolean}
 */
function getDarkMode() {
	return loadSetting('pushswap_darkmode', 'light');
}

/**
 * 다크모드를 토글합니다.
 */
function toggleDarkMode() {
	if (getDarkMode() === 'dark')
		setDarkMode('light');
	else
		setDarkMode('dark');
}


// 마우스 이벤트 상태를 저장할 변수
const darkmodeBtnStatus = {
	isDragging: false,
	offsetX: 0,
	offsetY: 0,
};

function clampGenerator(min, max) {
	return (value, size = 0) => {
		return Math.min(Math.max(min, value), Math.max(min, max - size));
	};
}

function scrollBarWidth() {
	return window.innerWidth - document.documentElement.clientWidth;
}

const clampX = clampGenerator(0, window.innerWidth - scrollBarWidth());
const clampY = clampGenerator(0, window.innerHeight);

function moveDarkmodeBtn(x, y) {
	darkmodeBtn.style.left = `${clampX(x, darkmodeBtn.offsetWidth)}px`;
	darkmodeBtn.style.top = `${clampY(y, darkmodeBtn.offsetHeight)}px`;
	storeSetting('pushswap_darkmode_btn_position', `${x},${y}`);
}

function handleDarkmodeDrag(e) {
	darkmodeBtnStatus.isDragging = true;
	const x = e.clientX - darkmodeBtnStatus.offsetX;
	const y = e.clientY - darkmodeBtnStatus.offsetY;
	
	// 버튼의 위치를 이동
	moveDarkmodeBtn(x, y);
}

function handleDarkmodeMouseUp(e) {
	const isBtnDragged = darkmodeBtnStatus.isDragging;
	darkmodeBtnStatus.isDragging = false;
	document.removeEventListener('mousemove', handleDarkmodeDrag);
	document.removeEventListener('mouseup', handleDarkmodeMouseUp);
	if (!isBtnDragged)
		toggleDarkMode();
}

/**
 * 다크모드 버튼이 클릭되면 다크모드를 토글합니다.
 */
document.addEventListener('mousedown', (e) => {
	if (!e.target.closest('#btn-darkmode')) return;
	darkmodeBtnStatus.offsetX = e.clientX - darkmodeBtn.getBoundingClientRect().left;
	darkmodeBtnStatus.offsetY = e.clientY - darkmodeBtn.getBoundingClientRect().top;
	document.addEventListener('mouseup', handleDarkmodeMouseUp);
	document.addEventListener('mousemove', handleDarkmodeDrag);
});


/**
 * 실행중인 명령어를 강조하거나 강조를 제거합니다.
 */
function removeHighlightCommand() {
	commands_elem.classList.remove('-active');
}
function highlightCommand(linenumber) {
	const height = linenumber * 20;
	commands_elem.classList.add('-active');
	commands_elem.style.backgroundPositionY = `${height}px`;
	commands_elem.scroll(0, Math.max(0, height - 40));
}

function pickHex(color1, color2, weight) {
	const w1 = 1 - weight;
	const w2 = weight;
	return (Math.round(color1.red * w1 + color2.red * w2).toString(16).padStart(2, '0')
		+ Math.round(color1.green * w1 + color2.green * w2).toString(16).padStart(2, '0')
		+ Math.round(color1.blue * w1 + color2.blue * w2).toString(16).padStart(2, '0'));
}

function parseRGB(str) {
	const rgb = str.match(/.{1,2}/g);
	return {
		red: parseInt(rgb[0], 16),
		green: parseInt(rgb[1], 16),
		blue: parseInt(rgb[2], 16),
	};
}

function pickColor(number) {
	const colors = dark_mode ? [
		parseRGB("BBD2C5"),
		parseRGB("536976"),
		parseRGB("292E49"),
	] : [
		parseRGB("A5FECB"),
		parseRGB("20BDFF"),
		parseRGB("5433FF"),
	];
	const percent = (number - min_val) / (max_val - min_val) * 1.999;
	console.log(percent);
	return pickHex(colors[Math.floor(percent)], colors[Math.floor(percent) + 1], percent % 1);
}

function setColor(elem) {
	const number = parseInt(elem.innerText);
	if (!Number.isInteger(number))
		return;
	elem.style.backgroundColor = `#${pickColor(number)}`
}

function setExecInterval(millisecond) {
	if (millisecond <= 0 || 1000 < millisecond)
		return;
	storeSetting('pushswap_exec_interval', `${millisecond}`);
	document.getElementById('output-exec-interval').value = `${millisecond}ms`
	interval_elem.value = millisecond;
}

function getExecInterval() {
	const localExecInterval = parseInt(loadSetting('pushswap_exec_interval'));
	return localExecInterval;
}
interval_elem.addEventListener('input', e => {
	setExecInterval(parseInt(e.target.value));
})

function setStackWidth() {
	stack_a.style.minWidth = `calc(1.2em + ${(Math.abs(max_val) + Math.abs(min_val)) * pixel_diff}px)`;
	stack_b.style.minWidth = `calc(1.2em + ${(Math.abs(max_val) + Math.abs(min_val)) * pixel_diff}px)`;
}

function setWidth(elem) {
	const number = parseInt(elem.innerText);
	elem.style.width = `calc(1.2em + ${Math.abs(number) * pixel_diff}px)`;
	if (min_val < 0) {
		if (number < 0)
			elem.style.marginLeft = `calc(${Math.abs(number - min_val) * pixel_diff}px)`;
		else
			elem.style.marginLeft = `calc(${Math.abs(min_val) * pixel_diff}px)`;
	}
}

function recalculateAll() {
	pixel_diff = 500 / (Math.abs(max_val) + Math.abs(min_val));
	setStackWidth();
	for (let i = 0; i < stack_a.children.length; ++i) {
		setWidth(stack_a.children[i]);
		setColor(stack_a.children[i]);
	}
	for (let i = 0; i < stack_b.children.length; ++i) {
		setWidth(stack_b.children[i]);
		setColor(stack_b.children[i]);
	}
}

function newElem(number) {
	if (!Number.isInteger(number))
		return null;
	if (usedSet.has(number)) {
		return null;
	}
	usedSet.add(number);
	const elem = document.createElement('div');
	elem.innerText = `${number}`
	elem.classList.add('elem');
	min_val = Math.min(min_val, number);
	max_val = Math.max(max_val, number);
	setWidth(elem);
	return elem;
}

function popTop(from) {
	if (!from)
		return;
	const elem = from.firstElementChild;
	if (!elem)
		return null;
	from.removeChild(elem);
	return elem;
}

function popBottom(from) {
	if (!from)
		return null;
	const elem = from.lastElementChild;
	if (!elem)
		return null;
	from.removeChild(elem);
	return elem;
}

function pushTop(to, elem) {
	if (!to || !elem)
		return;
	to.prepend(elem);
}

function pushBottom(to, elem) {
	if (!to || !elem)
		return;
	to.appendChild(elem);
}

function rotate(stack) {
	if (!stack)
		return;
	pushBottom(stack, popTop(stack));
}

function reverseRotate(stack) {
	if (!stack)
		return;
	pushTop(stack, popBottom(stack));
}

function swap(stack) {
	if (!stack)
		return;
	pushTop(stack, stack.firstElementChild?.nextElementSibling);
}

function addNode(number) {
	if (Number.isInteger(number))
		return;
	pushBottom(stack_a, newElem(number));
}

function pa() {
	pushTop(stack_a, popTop(stack_b));
}

function pb() {
	pushTop(stack_b, popTop(stack_a));
}

function ra() {
	pushBottom(stack_a, popTop(stack_a));
}

function rb() {
	pushBottom(stack_b, popTop(stack_b));
}

function rr() {
	pushBottom(stack_a, popTop(stack_a));
	pushBottom(stack_b, popTop(stack_b));
}

function rra() {
	pushTop(stack_a, popBottom(stack_a));
}

function rrb() {
	pushTop(stack_b, popBottom(stack_b));
}

function rrr() {
	pushTop(stack_a, popBottom(stack_a));
	pushTop(stack_b, popBottom(stack_b));
}

function sa() {
	swap(stack_a);
}

function sb() {
	swap(stack_b);
}

function ss() {
	swap(stack_a);
	swap(stack_b);
}

document.getElementById('btn-pa').addEventListener('click', () => {
	if (command_record_status) {
		commands_elem.value += 'pa\n';
		command_list.push('pa');
	}
	pa();
});
document.getElementById('btn-pb').addEventListener('click', () => {
	if (command_record_status) {
		commands_elem.value += 'pb\n';
		command_list.push('pb');
	}
	pb();
});
document.getElementById('btn-ra').addEventListener('click', () => {
	if (command_record_status) {
		commands_elem.value += 'ra\n';
		command_list.push('ra');
	}
	ra();
});
document.getElementById('btn-rb').addEventListener('click', () => {
	if (command_record_status) {
		commands_elem.value += 'rb\n';
		command_list.push('rb');
	}
	rb();
});
document.getElementById('btn-rr').addEventListener('click', () => {
	if (command_record_status) {
		commands_elem.value += 'rr\n';
		command_list.push('rr');
	}
	rr();
});
document.getElementById('btn-rra').addEventListener('click', () => {
	if (command_record_status) {
		commands_elem.value += 'rra\n';
		command_list.push('rra');
	}
	rra();
});
document.getElementById('btn-rrb').addEventListener('click', () => {
	if (command_record_status) {
		commands_elem.value += 'rrb\n';
		command_list.push('rrb');
	}
	rrb();
});
document.getElementById('btn-rrr').addEventListener('click', () => {
	if (command_record_status) {
		commands_elem.value += 'rrr\n';
		command_list.push('rrr');
	}
	rrr();
});
document.getElementById('btn-sa').addEventListener('click', () => {
	if (command_record_status) {
		commands_elem.value += 'sa\n';
		command_list.push('sa');
	}
	sa();
});
document.getElementById('btn-sb').addEventListener('click', () => {
	if (command_record_status) {
		commands_elem.value += 'sb\n';
		command_list.push('sb');
	}
	sb();
});
document.getElementById('btn-ss').addEventListener('click', () => {
	if (command_record_status) {
		commands_elem.value += 'ss\n';
		command_list.push('ss');
	}
	ss();
});


function cleanAll() {
	min_val = Infinity;
	max_val = -Infinity;
	pixel_diff = 5;
	usedSet = new Set();
	usedCommandStack = [];
	stack_a.replaceChildren();
	stack_b.replaceChildren();
	clearTimeout(execute_timeout_id);
	execute_timeout_id = null;
	command_list = [];
	document.getElementById('out-sort-result').innerText = `waiting for commands`;
}

function resetAnimation(elem) {
	elem.style.animation = 'none';
	elem.offsetHeight;
	elem.style.animation = null;
}
let fade_in_timeout_id = null;
function copyExecCommand() {
	const copyShellCommand = {
		mac: `| pbcopy`,
		windows: `| clip`,
		linux: `| xclip -selection clipboard`,
		unknown: ``
	}
	window.navigator.clipboard.writeText(
		`./push_swap "${number_output.value}" ${copyShellCommand[os.getOSType()]}`
	);
	const modal = document.getElementById('modal-copied');
	if (modal.classList.contains('fade-in-active')) {
		modal.classList.remove('fade-in-active');
		clearTimeout(fade_in_timeout_id);
		fade_in_timeout_id = null;
		resetAnimation(modal);
	}
	modal.classList.add('fade-in-active');
	fade_in_timeout_id = setTimeout(() => {
		modal.classList.remove('fade-in-active');
		fade_in_timeout_id = null;
		resetAnimation(modal);
	}, 2000);
}


function readSize() {
	const size = parseInt(document.getElementById('input-size').value);
	if (!Number.isSafeInteger(size))
		return null;
	return size;
}

document.getElementById('btn-inc').addEventListener('click', () => {
	const count = readSize();
	if (!count)
		return;
	cleanAll();
	let list = Array.from({ length: count }, (_, i) => i + 1);
	number_output.value = list.join(' ');
	list.forEach(i => addNode(i));
	recalculateAll();
	copyExecCommand();
});

document.getElementById('btn-dec').addEventListener('click', () => {
	const count = readSize();
	if (!count)
		return;
	cleanAll();
	let list = Array.from({ length: count }, (_, i) => count - i);
	number_output.value = list.join(' ');
	list.forEach(i => addNode(i));
	recalculateAll();
	copyExecCommand();
});

function setRandom() {
	const count = readSize();
	if (!count)
		return;
	cleanAll();
	let list = Array.from({ length: count }, (_, i) => i + 1);
	const shuffleCnt = count * 10;
	for (let i = 0; i < shuffleCnt; ++i) {
		const first = Math.floor(Math.random() * count);
		const second = Math.floor(Math.random() * count);
		const tmp = list[first];
		list[first] = list[second];
		list[second] = tmp;
	}
	number_output.value = list.join(' ');
	list.forEach(i => addNode(i));
	recalculateAll();
	copyExecCommand();
}

function setManualNumber() {
	cleanAll();
	const list = number_output.value.split(' ')
		.map(strnum => parseInt(strnum))
		.filter(number => Number.isSafeInteger(number));
	number_output.value = list.join(' ');
	list.forEach(i => addNode(i));
	recalculateAll();
}
document.getElementById('btn-random').addEventListener('click', setRandom);
document.getElementById('input-size').addEventListener('keydown', e => {
	if (e.code === "Enter")
		setRandom();
})
document.getElementById('copy-number-output').addEventListener('click', () => {
	copyExecCommand();
});
document.getElementById('btn-exec-reset').addEventListener('click', () => {
	cleanAll();
	const list = number_output.value.split(' ')
		.map(strnum => parseInt(strnum))
		.filter(number => Number.isSafeInteger(number));
	number_output.value = list.join(' ');
	list.forEach(i => addNode(i));
	recalculateAll();
});

function countCommands() {
	return command_list.filter((command) => {
		return (command === 'pa' || command === 'pb'
			|| command === 'ra' || command === 'rb' || command === 'rr'
			|| command === 'rra' || command === 'rrb' || command === 'rrr'
			|| command === 'sa' || command === 'sb' || command === 'ss');
	}).length;
}

function commandExecuter() {
	for (let idx = next_command_idx; idx < command_list.length; ++idx) {
		let is_updated = true;
		switch (command_list[idx]) {
			case 'pa':
				pa();
				break;
			case 'pb':
				pb();
				break;
			case 'ra':
				ra();
				break;
			case 'rb':
				rb();
				break;
			case 'rr':
				rr();
				break;
			case 'rra':
				rra();
				break;
			case 'rrb':
				rrb();
				break;
			case 'rrr':
				rrr();
				break;
			case 'sa':
				sa();
				break;
			case 'sb':
				sb();
				break;
			case 'ss':
				ss();
				break;
			default:
				is_updated = false;
				break;
		}
		if (is_updated) {
			highlightCommand(idx + 1);
			next_command_idx = idx + 1;
			usedCommandStack.push(idx);
			break;
		}
	}
}

function reverseCommandExecuter() {
	if (usedCommandStack.length === 0)
		return;
	switch (command_list[usedCommandStack[usedCommandStack.length - 1]]) {
		case 'pa':
			pb();
			break;
		case 'pb':
			pa();
			break;
		case 'ra':
			rra();
			break;
		case 'rb':
			rrb();
			break;
		case 'rr':
			rrr();
			break;
		case 'rra':
			ra();
			break;
		case 'rrb':
			rb();
			break;
		case 'rrr':
			rr();
			break;
		case 'sa':
			sa();
			break;
		case 'sb':
			sb();
			break;
		case 'ss':
			ss();
			break;
		default:
			is_updated = false;
			break;
	}
	highlightCommand(usedCommandStack[usedCommandStack.length - 1] - 1);
	next_command_idx = usedCommandStack[usedCommandStack.length - 1];
	usedCommandStack.pop();
	if (usedCommandStack.length === 0)
		removeHighlightCommand();
}

function checkSorted() {
	let sorted = true;
	if (stack_b.children.length !== 0) {
		sorted = false;
		for (let i = 0; i < stack_b.children.length; ++i) {
			stack_b.children[i].style.backgroundColor = 'red';
		}
	}
	let prev = -Infinity;
	for (let i = 0; i < stack_a.children.length; ++i) {
		const cur = parseInt(stack_a.children[i].innerText);
		if (prev > cur) {
			stack_a.children[i].style.backgroundColor = 'red';
			sorted = false;
		}
		else
			prev = cur;
	}
	return sorted;
}

function runInputCommand() {
	commandExecuter();
	document.getElementById('out-sort-result').innerText = `running...`;
	if (next_command_idx < command_list.length)
		execute_timeout_id = setTimeout(runInputCommand, interval_elem.value);
	else {
		if (checkSorted())
			document.getElementById('out-sort-result').innerText = `sorted! :)`;
		else
			document.getElementById('out-sort-result').innerText = `not sorted! ;(`;
		execute_timeout_id = null;
	}
};
function revRunInputCommand() {
	reverseCommandExecuter();
	if (0 < usedCommandStack.length)
		execute_timeout_id = setTimeout(revRunInputCommand, interval_elem.value);
	else
		execute_timeout_id = null;
};
function resetCommands() {
	command_list = commands_elem.value.trim().split('\n').filter(command =>
		command === 'pa' || command === 'pb'
		|| command === 'ra' || command === 'rb' || command === 'rr'
		|| command === 'rra' || command === 'rrb' || command === 'rrr'
		|| command === 'sa' || command === 'sb' || command === 'ss'
	);
}
function resetStack() {
	cleanAll();
	const list = number_output.value.split(' ')
		.map(strnum => parseInt(strnum))
		.filter(number => Number.isSafeInteger(number));
	number_output.value = list.join(' ');
	list.forEach(i => addNode(i));
	recalculateAll();
	removeHighlightCommand();
	next_command_idx = 0;
}

function setCommandCount() {
	command_cnt_elem.innerText = command_list.length;
}

commands_elem.addEventListener('input', () => {
	resetStack();
	resetCommands();
	setCommandCount();
});
document.getElementById('btn-exec-start-rev').addEventListener('click', () => {
	clearTimeout(execute_timeout_id);
	execute_timeout_id = null;
	revRunInputCommand();
});
document.getElementById('btn-exec-start').addEventListener('click', () => {
	clearTimeout(execute_timeout_id);
	runInputCommand();
});
document.getElementById('btn-exec-pause').addEventListener('click', () => {
	clearTimeout(execute_timeout_id);
});
document.getElementById('btn-exec-prev').addEventListener('click', () => {
	clearTimeout(execute_timeout_id);
	reverseCommandExecuter();
});
document.getElementById('btn-exec-next').addEventListener('click', () => {
	clearTimeout(execute_timeout_id);
	commandExecuter();
});
document.getElementById('btn-exec-reset').addEventListener('click', () => {
	resetStack();
	resetCommands();
});

/* ----------- 초기화 로직 ----------*/
function initDarkMode() {
	const localDarkmode = loadSetting('pushswap_darkmode');
	if (!localDarkmode) {
		const systemDarkmode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
		setDarkMode(systemDarkmode === true ? 'dark' : 'light');
	}
	else {
		setDarkMode(localDarkmode);
	}
	const darkmodeBtnPosition = loadSetting('pushswap_darkmode_btn_position');
	if (darkmodeBtnPosition) {
		const [x, y] = darkmodeBtnPosition.split(',').map(Number);
		moveDarkmodeBtn(x, y);
	}
}
function initExecInterval() {
	const localExecInterval = loadSetting('pushswap_exec_interval', '100');
	setExecInterval(localExecInterval);
}

/* 첫 방문 튜토리얼 등을 위한 클래스 */
const firstVisitEventManager = (() => {
	const handlers = [];
	const setVisited = () => storeSetting('visited', 'true');
	return {
		isFirstVisit: () => loadSetting('visited') === null,
		addFirstVisitHandler: (handler) => {
			handlers.push(handler);
		},
		executeFirstVisitHandlers: () => {
			handlers.forEach(handler => handler());
			setVisited();
		}
	}
})();

// 튜토리얼 데이터 정의
const tutorialSteps = [
	{
			element: "#input-size",
			message: "랜덤하게 생성할 숫자의 갯수를 입력해주세요."
	},
	{
			element: "#btn-sort_group",
			message: "버튼을 클릭하여 정렬된 상태로 숫자를 생성해주세요."
	},
	{
		element: "#tutorial-generated-numbers",
		message: "copy 버튼을 누르고 터미널에 붙여넣기하여 실행해주세요.\n리눅스는 xclip이 필요합니다.\n(sudo apt-get install xclip)"
	},
	{
		element: "#commands-output",
		message: "여기에 ctrl+v를 눌러 주세요.\n이전 단계에서 쉘 명령어를 실행했다면 push swap의 명령어는 이미 복사되어 있어요."
	},
	{
		element: "#btn-exec-start",
		message: "실행 버튼으로 push swap 명령어를 실행시켜보세요."
	},
	{
		// 거꾸로 실행
			element: "#btn-exec-start-rev",
			message: "거꾸로 실행 할 수도 있어요."
	},
	{
		// 한 단계씩 실행
			element: "#btn-exec-next",
			message: "한 단계씩 실행도 가능해요."
	},
	{
		// 초기화
			element: "#btn-exec-reset",
			message: "초기화 버튼을 눌러 처음부터 다시 할 수도 있어요."
	}
];

// 튜토리얼 단계 초기화
let currentStep = 0;
let previousElementStyle = "";

function startTutorial() {
	document.getElementById("tutorial-overlay").style.display = "block";
	currentStep = 0;
	showTutorialStep();
}

function showTutorialStep() {
	const step = tutorialSteps[currentStep];
	const element = document.querySelector(step.element);
	const tooltip = document.getElementById("tooltip");
	const tooltipText = document.getElementById("tooltip-text");
	const stepCount = document.getElementById("tutorial-step");
	stepCount.innerText = `${currentStep + 1} / ${tutorialSteps.length}`;

	// 설명 텍스트 업데이트
	tooltipText.innerText = step.message;

	// 대상 요소의 위치 가져오기
	const rect = element.getBoundingClientRect();
	tooltip.style.top = `${rect.top + window.scrollY - 50}px`;
	tooltip.style.left = `${rect.right + window.scrollX + 20}px`;

	// 요소 강조 효과 추가
	element.style.position = "relative";
	element.style.zIndex = 1001;
	element.style.border = "2px solid #ff0"; // 강조색
}

function nextTutorialStep() {
	// 이전 단계의 스타일 초기화
	const previousElement = document.querySelector(tutorialSteps[currentStep].element);
	previousElement.style = "";
	if (currentStep < tutorialSteps.length - 1) {
			currentStep++;
			showTutorialStep();
	} else {
			endTutorial();
	}
}

function skipTutorial() {
	endTutorial();
}

function endTutorial() {
	document.getElementById("tutorial-overlay").style.display = "none";
	tutorialSteps.forEach(step => {
			const element = document.querySelector(step.element);
			element.style = "";
	});
}

document.getElementById('insert-number-btn').addEventListener('click', setManualNumber);
document.getElementById('record-command-btn').addEventListener('click', () => {
	command_record_status = !command_record_status;
	console.log('command record status:', command_record_status);
});

/**
 * 패치노트를 열거나 닫습니다.
 */
document.querySelectorAll('.toggle-header').forEach(header => {
	header.addEventListener('click', () => {
			const patchNote = header.parentElement;
			// 패치노트를 열거나 닫기
			patchNote.classList.toggle('open');
	});
});
// main logic

firstVisitEventManager.addFirstVisitHandler(startTutorial);
document.querySelector('#btn-tutorial').addEventListener('click', startTutorial);

initDarkMode();
initExecInterval();
if (firstVisitEventManager.isFirstVisit())
{
	firstVisitEventManager.executeFirstVisitHandlers();
}