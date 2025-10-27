// Data model and constants
const INTERVALS = [60,300,720,1440,2880,4320,10080,20160,43200,129600,172800,216000,259200];
const STORAGE_KEY = 'vocabularyFlashcards';
const LISTS_STORAGE_KEY = 'vocabularyFlashcardsLists';
const CURRENT_LIST_KEY = 'vocabularyFlashcardsCurrentList';
const NIGHT_MODE_KEY = 'vocabularyFlashcardsNightMode';

// State
let cards = [];
let lists = [];
let currentListId = null;
let currentSession = { cards:[], currentIndex:0, correctCount:0, type:'', direction:'wordToMeaning' };

// Recording state
let mediaRecorder = null;
let recordedChunks = [];
let mediaStream = null;

// DOM
const views = {
    dashboard: document.getElementById('dashboardView'),
    practice: document.getElementById('practiceView'),
    summary: document.getElementById('summaryView'),
    stats: document.getElementById('statsView'),
    import: document.getElementById('importView')
};
const sideNav = document.getElementById('sideNav');
const overlay = document.getElementById('overlay');
const burgerBtn = document.getElementById('burgerBtn');

// Note modal
const noteModal = document.getElementById('noteModal');
const noteInput = document.getElementById('noteInput');
const noteModalTitle = document.getElementById('noteModalTitle');
const saveNoteBtn = document.getElementById('saveNoteBtn');
const cancelNoteBtn = document.getElementById('cancelNoteBtn');

// Edit word modal
const editWordModal = document.getElementById('editWordModal');
const editWordInput = document.getElementById('editWordInput');
const editMeaningInput = document.getElementById('editMeaningInput');
const editGenderInput = document.getElementById('editGenderInput');
const editWordModalTitle = document.getElementById('editWordModalTitle');
const saveEditWordBtn = document.getElementById('saveEditWordBtn');
const cancelEditWordBtn = document.getElementById('cancelEditWordBtn');

// Practice view elements for audio
const playAudioBtn = document.getElementById('playAudioBtn');
const recordAudioBtn = document.getElementById('recordAudioBtn');

function init() {
    loadLists();
    loadCards();
    updateDashboard();
    setupEventListeners();
    updateLanguageSelector();
    // night mode
    const savedNight = localStorage.getItem(NIGHT_MODE_KEY);
    applyNightMode(savedNight === 'true');

    // Ensure record button availability based on support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
        if (recordAudioBtn) {
            recordAudioBtn.disabled = true;
            recordAudioBtn.title = 'Recording not supported by this browser';
        }
    }
}

function applyNightMode(enable) {
    if (enable) {
        document.body.classList.add('night-mode');
        const btn = document.getElementById('nightModeToggle');
        if (btn) btn.textContent = '☀️';
    } else {
        document.body.classList.remove('night-mode');
        document.body.classList.remove('feminine-theme', 'neutral-theme');
        const btn = document.getElementById('nightModeToggle');
        if (btn) btn.textContent = '🌙';
    }
}

function toggleNightMode() {
    const isNight = document.body.classList.toggle('night-mode');
    const btn = document.getElementById('nightModeToggle');
    if (btn) btn.textContent = isNight ? '☀️' : '🌙';
    localStorage.setItem(NIGHT_MODE_KEY, isNight ? 'true' : 'false');
    
    // Reset gender theme when toggling night mode
    if (!isNight) {
        document.body.classList.remove('feminine-theme', 'neutral-theme');
    }
}

// Apply gender-based theme
function applyGenderTheme(gender) {
    // Remove existing gender themes
    document.body.classList.remove('feminine-theme', 'neutral-theme');
    
    // Apply new theme based on gender
    if (gender === 'feminine') {
        document.body.classList.add('feminine-theme');
    } else if (gender === 'neutral') {
        document.body.classList.add('neutral-theme');
    }
    // For masculine or no gender, use default night mode (already set)
}

// Lists
function loadLists() {
    const storedLists = localStorage.getItem(LISTS_STORAGE_KEY);
    if (storedLists) lists = JSON.parse(storedLists);
    if (!lists || lists.length === 0) {
        lists = [{ id: generateId(), name: 'Default List', createdAt: new Date().toISOString() }];
        saveLists();
    }
    const storedCurrentListId = localStorage.getItem(CURRENT_LIST_KEY);
    currentListId = storedCurrentListId || lists[0].id;
    if (!lists.find(l => l.id === currentListId)) {
        currentListId = lists[0].id;
        localStorage.setItem(CURRENT_LIST_KEY, currentListId);
    }
    renderLists();
}

function saveLists() { localStorage.setItem(LISTS_STORAGE_KEY, JSON.stringify(lists)); }

function renderLists() {
    const listsContainer = document.getElementById('listsContainer');
    if (!listsContainer) return;
    listsContainer.innerHTML = '';
    lists.forEach(list => {
        const listElement = document.createElement('div');
        listElement.className = `list-item ${list.id === currentListId ? 'active' : ''}`;
        const nameSpan = document.createElement('span');
        nameSpan.textContent = list.name;
        nameSpan.style.flex = '1';
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-list-btn';
        deleteBtn.title = 'Delete list';
        deleteBtn.type = 'button';
        deleteBtn.innerHTML = '🗑️';
        listElement.addEventListener('click', () => {
            currentListId = list.id;
            localStorage.setItem(CURRENT_LIST_KEY, currentListId);
            loadCards();
            renderLists();
            updateDashboard();
            closeSideNav();
        });
        (function attachDeleteHandlers(btn, listId) {
            let handled = false;
            const doDelete = (e) => {
                if (e) { try{ e.stopPropagation(); }catch{} try{ e.preventDefault(); }catch{} }
                if (handled) return;
                handled = true;
                deleteList(listId);
                setTimeout(()=>{ handled=false; },400);
            };
            btn.addEventListener('click', doDelete);
            btn.addEventListener('touchstart', doDelete, { passive:false });
            btn.addEventListener('pointerdown', function(e){ if (e.pointerType==='mouse') return; doDelete(e); });
        })(deleteBtn, list.id);
        listElement.appendChild(nameSpan);
        listElement.appendChild(deleteBtn);
        listsContainer.appendChild(listElement);
    });
}

function deleteList(listId) {
    const toDelete = lists.find(l => l.id === listId);
    if (!toDelete) return;
    if (!confirm(`Delete the list "${toDelete.name}" and ALL its cards? This action cannot be undone.`)) return;
    lists = lists.filter(l => l.id !== listId);
    saveLists();
    const storedCardsStr = localStorage.getItem(STORAGE_KEY);
    let allCards = storedCardsStr ? JSON.parse(storedCardsStr) : [];
    allCards = allCards.filter(c => c.listId !== listId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allCards));
    if (currentListId === listId) {
        if (lists.length > 0) {
            currentListId = lists[0].id;
            localStorage.setItem(CURRENT_LIST_KEY, currentListId);
        } else {
            const defaultList = { id: generateId(), name: 'Default List', createdAt: new Date().toISOString() };
            lists = [defaultList];
            saveLists();
            currentListId = defaultList.id;
            localStorage.setItem(CURRENT_LIST_KEY, currentListId);
        }
    }
    loadCards();
    renderLists();
    updateDashboard();
    alert('List deleted.');
}

// Cards
function loadCards() {
    const storedCards = localStorage.getItem(STORAGE_KEY);
    if (storedCards) {
        const allCards = JSON.parse(storedCards);
        cards = allCards.filter(card => card.listId === currentListId);
        cards = cards.map(card => {
            if (card.known === undefined) card.known = false;
            if (card.note === undefined) card.note = '';
            if (card.image === undefined) card.image = '';
            if (card.audio === undefined) card.audio = '';
            if (card.gender === undefined) card.gender = '';
            return card;
        });
    } else cards = [];
}

function saveCards() {
    const storedCards = localStorage.getItem(STORAGE_KEY);
    let allCards = storedCards ? JSON.parse(storedCards) : [];
    allCards = allCards.filter(card => card.listId !== currentListId);
    allCards = allCards.concat(cards);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allCards));
}

function updateDashboard() {
    const totalCards = cards.length;
    const neverPracticed = cards.filter(card => !card.practiced && !card.known).length;
    const readyToPractice = cards.filter(card => isCardReadyToPractice(card) && !card.known).length;
    const knownWords = cards.filter(card => card.known).length;
    document.getElementById('totalCards').textContent = totalCards;
    document.getElementById('neverPracticed').textContent = neverPracticed;
    document.getElementById('readyToPractice').textContent = readyToPractice;
    document.getElementById('knownWords').textContent = knownWords;
    document.getElementById('learnNewBtn').disabled = neverPracticed === 0;
    document.getElementById('practiceLearnedBtn').disabled = readyToPractice === 0;
}

function isCardReadyToPractice(card) {
    if (!card.practiced || card.known) return false;
    const now = new Date();
    const dueDate = new Date(card.nextDueAt);
    return card.successRate < 0.7 || now >= dueDate;
}

function showView(viewName) {
    Object.keys(views).forEach(k => views[k].classList.remove('active'));
    views[viewName].classList.add('active');
    
    // Reset gender theme when leaving practice view
    if (viewName !== 'practice') {
        document.body.classList.remove('feminine-theme', 'neutral-theme');
    }
}

function generateId(){ return Date.now().toString(36) + Math.random().toString(36).substring(2); }

// Sessions
function startLearnSession() {
    const batchSize = parseInt(document.getElementById('batchSize').value);
    const direction = document.getElementById('direction').value;
    const newWords = cards.filter(card => !card.practiced && !card.known);
    if (newWords.length === 0) { alert('No new words to learn!'); return; }
    const selectedCards = shuffleArray(newWords).slice(0, batchSize);
    currentSession = { cards:selectedCards, currentIndex:0, correctCount:0, type:'learn', direction };
    showPracticeCard();
    showView('practice');
}

function startPracticeSession() {
    const batchSize = parseInt(document.getElementById('batchSize').value);
    const direction = document.getElementById('direction').value;
    const readyCards = cards.filter(card => isCardReadyToPractice(card));
    if (readyCards.length === 0) { alert('No cards are ready to practice right now.'); return; }
    const selectedCards = shuffleArray(readyCards).slice(0, batchSize);
    currentSession = { cards:selectedCards, currentIndex:0, correctCount:0, type:'practice', direction };
    showPracticeCard();
    showView('practice');
}

// Show practice card and update audio UI
function showPracticeCard() {
    const { currentIndex, cards: sessionCards, direction } = currentSession;
    const card = sessionCards[currentIndex];
    if (!card) { endSession(); return; }
    document.getElementById('progressText').textContent = `Question ${currentIndex + 1} of ${sessionCards.length}`;
    const isWordToMeaning = direction === 'wordToMeaning';
    document.getElementById('questionText').textContent = isWordToMeaning ? card.word : card.meaning;

    // Apply gender theme
    applyGenderTheme(card.gender);

    // Display gender if available
    const genderDisplay = document.getElementById('genderDisplay');
    if (card.gender && card.gender.trim() !== '') {
        genderDisplay.textContent = card.gender.charAt(0).toUpperCase() + card.gender.slice(1);
        genderDisplay.style.display = 'block';
    } else {
        genderDisplay.style.display = 'none';
    }

    // --- first-time meaning hint (shown only in a 'learn' session) ---
    const firstTimeHint = document.getElementById('firstTimeHint');
    if (firstTimeHint) {
        if (currentSession.type === 'learn') {
            // show the meaning when the prompt is Word -> Meaning,
            // or show the word when the prompt is Meaning -> Word
            if (isWordToMeaning) {
                firstTimeHint.textContent = `Meaning: ${card.meaning}`;
                firstTimeHint.style.display = 'block';
            } else {
                firstTimeHint.textContent = `Word: ${card.word}`;
                firstTimeHint.style.display = 'block';
            }
        } else {
            firstTimeHint.style.display = 'none';
        }
    }
    // --- end first-time hint ---

    // note
    const noteDisplay = document.getElementById('noteDisplay');
    if (card.note && card.note.trim() !== '') { noteDisplay.textContent = card.note; noteDisplay.style.display = 'block'; }
    else { noteDisplay.style.display = 'none'; }

    const editNoteBtn = document.getElementById('editNoteBtn');
    editNoteBtn.textContent = card.note && card.note.trim() !== '' ? 'Edit Note' : 'Add Note';

    // options
    const optionsContainer = document.getElementById('optionsContainer');
    optionsContainer.innerHTML = '';
    const correctAnswer = isWordToMeaning ? card.meaning : card.word;
    const distractorCards = getDistractors(card, isWordToMeaning);
    const optionCards = shuffleArray([card, ...distractorCards]);
    optionCards.forEach(optionCard => {
        const optionElement = document.createElement('div');
        optionElement.className = 'option';
        const optionValue = isWordToMeaning ? optionCard.meaning : optionCard.word;
        optionElement.dataset.value = optionValue;
        optionElement.tabIndex = 0;
        if (optionCard.image && optionCard.image.trim() !== '') {
            const img = document.createElement('img');
            img.src = optionCard.image.trim();
            img.onerror = function(){ this.style.display = 'none'; };
            optionElement.appendChild(img);
        }
        const textSpan = document.createElement('div');
        textSpan.className = 'opt-text';
        textSpan.textContent = optionValue;
        optionElement.appendChild(textSpan);
        optionElement.addEventListener('click', ()=> checkAnswer(optionElement.dataset.value, correctAnswer));
        optionElement.addEventListener('keydown', (e)=> { if (e.key==='Enter' || e.key===' ') { e.preventDefault(); optionElement.click(); }});
        optionsContainer.appendChild(optionElement);
    });

    document.getElementById('cardActions').style.display = 'flex';
    document.getElementById('feedback').style.display = 'none';

    // Update audio UI: show/hide play button; set record button label
    updateAudioUIForCard(card);
}

function getDistractors(card, isWordToMeaning) {
    const otherCards = cards.filter(c => c.id !== card.id && c.listId === currentListId && !c.known);
    if (otherCards.length === 0) return [];
    const shuffled = shuffleArray(otherCards);
    return shuffled.slice(0,3);
}

function checkAnswer(selectedAnswer, correctAnswer) {
    const isCorrect = selectedAnswer === correctAnswer;
    const card = currentSession.cards[currentSession.currentIndex];
    card.timesShown = (card.timesShown || 0) + 1;
    if (isCorrect) card.correctCount = (card.correctCount || 0) + 1;
    else card.wrongCount = (card.wrongCount || 0) + 1;
    card.successRate = (card.correctCount || 0) / ((card.correctCount || 0) + (card.wrongCount || 0));
    card.lastAskedAt = new Date().toISOString();
    if (currentSession.type === 'learn') {
        card.practiced = true;
        card.scheduleIndex = 1;
    } else {
        if (isCorrect) card.scheduleIndex = Math.min((card.scheduleIndex || 0) + 1, INTERVALS.length - 1);
        else card.scheduleIndex = Math.max(0, (card.scheduleIndex || 0) - 1);
    }
    const intervalMinutes = INTERVALS[card.scheduleIndex || 0];
    const nextDueDate = new Date(); nextDueDate.setMinutes(nextDueDate.getMinutes() + intervalMinutes);
    card.nextDueAt = nextDueDate.toISOString();
    if (isCorrect) currentSession.correctCount++;
    const feedbackElement = document.getElementById('feedback');
    feedbackElement.textContent = isCorrect ? 'Correct!' : `Incorrect. The answer is: ${correctAnswer}`;
    feedbackElement.className = `feedback ${isCorrect ? 'correct' : 'incorrect'}`;
    feedbackElement.style.display = 'block';
    const options = document.querySelectorAll('.option');
    options.forEach(option => {
        option.style.pointerEvents = 'none';
        const val = option.dataset.value;
        if (val === correctAnswer) option.classList.add('correct');
        else if (val === selectedAnswer && !isCorrect) option.classList.add('incorrect');
    });
    setTimeout(()=>{
        currentSession.currentIndex++;
        if (currentSession.currentIndex < currentSession.cards.length) showPracticeCard();
        else endSession();
        saveCards();
    },700);
}

function endSession() {
    const { correctCount, cards: sessionCards, type } = currentSession;
    const totalQuestions = sessionCards.length;
    const accuracy = totalQuestions > 0 ? (correctCount / totalQuestions * 100).toFixed(1) : 0;
    document.getElementById('summaryTitle').textContent = type === 'learn' ? 'Learning Session Complete' : 'Practice Session Complete';
    document.getElementById('summaryText').textContent = `You got ${correctCount} out of ${totalQuestions} correct (${accuracy}% accuracy).`;
    showView('summary');
    updateDashboard();
    
    // Reset gender theme after session
    document.body.classList.remove('feminine-theme', 'neutral-theme');
}

function markCurrentCardAsKnown() {
    const card = currentSession.cards[currentSession.currentIndex];
    if (card) {
        card.known = true;
        saveCards();
        currentSession.currentIndex++;
        if (currentSession.currentIndex < currentSession.cards.length) showPracticeCard();
        else endSession();
    }
}

function deleteCurrentCard() {
    const card = currentSession.cards[currentSession.currentIndex];
    if (card && confirm(`Are you sure you want to delete the card "${card.word}"?`)) {
        currentSession.cards.splice(currentSession.currentIndex, 1);
        const cardIndex = cards.findIndex(c => c.id === card.id);
        if (cardIndex !== -1) {
            cards.splice(cardIndex, 1);
            saveCards();
            updateDashboard();
        }
        if (currentSession.currentIndex < currentSession.cards.length) showPracticeCard();
        else if (currentSession.cards.length === 0) endSession();
        else { currentSession.currentIndex--; showPracticeCard(); }
    }
}

function showNoteModal() {
    const card = currentSession.cards[currentSession.currentIndex];
    if (!card) return;
    noteModalTitle.textContent = card.note && card.note.trim() !== '' ? 'Edit Note' : 'Add Note';
    noteInput.value = card.note || '';
    noteModal.classList.add('active');
    noteInput.focus();
}

function saveNote() {
    const card = currentSession.cards[currentSession.currentIndex];
    if (card) {
        card.note = noteInput.value.trim();
        saveCards();
        closeNoteModal();
        const noteDisplay = document.getElementById('noteDisplay');
        const editNoteBtn = document.getElementById('editNoteBtn');
        if (card.note && card.note.trim() !== '') {
            noteDisplay.textContent = card.note;
            noteDisplay.style.display = 'block';
            editNoteBtn.textContent = 'Edit Note';
        } else {
            noteDisplay.style.display = 'none';
            editNoteBtn.textContent = 'Add Note';
        }
    }
}

function closeNoteModal() { noteModal.classList.remove('active'); noteInput.value = ''; }

function showEditWordModal() {
    const card = currentSession.cards[currentSession.currentIndex];
    if (!card) return;
    editWordModalTitle.textContent = 'Edit Card';
    editWordInput.value = card.word || '';
    editMeaningInput.value = card.meaning || '';
    editGenderInput.value = card.gender || '';
    editWordModal.classList.add('active');
    editWordInput.focus();
}

function saveEditWord() {
    const card = currentSession.cards[currentSession.currentIndex];
    if (!card) return;
    const newWord = editWordInput.value.trim();
    const newMeaning = editMeaningInput.value.trim();
    const newGender = editGenderInput.value;
    if (!newWord || !newMeaning) {
        alert('Please enter both word and meaning');
        return;
    }
    // update session card
    card.word = newWord;
    card.meaning = newMeaning;
    card.gender = newGender;

    // update global cards array and persist
    const idx = cards.findIndex(c => c.id === card.id);
    if (idx !== -1) {
        cards[idx].word = newWord;
        cards[idx].meaning = newMeaning;
        cards[idx].gender = newGender;
    }
    saveCards();
    closeEditWordModal();

    // Refresh visible card and stats
    showPracticeCard();
    updateDashboard();
}

function closeEditWordModal() {
    if (!editWordModal) return;
    editWordModal.classList.remove('active');
    editWordInput.value = '';
    editMeaningInput.value = '';
    editGenderInput.value = '';
}

// Statistics UI & helpers
function showStatistics(filter = 'availableNow') {
    const tableBody = document.getElementById('statsTableBody');
    tableBody.innerHTML = '';
    let filteredCards = [];
    switch(filter) {
        case 'availableNow': filteredCards = cards.filter(isCardReadyToPractice); break;
        case 'neverPracticed': filteredCards = cards.filter(card => !card.practiced && !card.known); break;
        case 'knownWords': filteredCards = cards.filter(card => card.known); break;
        default: filteredCards = [...cards];
    }
    const sortHeader = document.querySelector('th[data-sort-direction="asc"], th[data-sort-direction="desc"]');
    if (sortHeader) {
        const sortBy = sortHeader.dataset.sort;
        const sortDirection = sortHeader.dataset.sortDirection;
        filteredCards.sort((a,b)=> {
            let valueA = a[sortBy];
            let valueB = b[sortBy];
            if (sortBy === 'nextDueAt') {
                valueA = valueA ? new Date(valueA).getTime() : 0;
                valueB = valueB ? new Date(valueB).getTime() : 0;
            }
            if (valueA < valueB) return sortDirection === 'asc' ? -1 : 1;
            if (valueA > valueB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }
    filteredCards.forEach(card => {
        const row = document.createElement('tr');
        const lastAsked = card.lastAskedAt ? new Date(card.lastAskedAt).toLocaleDateString() : 'Never';
        let nextDue = 'Not scheduled'; let dueBadge = '';
        if (card.nextDueAt) {
            const dueDate = new Date(card.nextDueAt);
            nextDue = dueDate.toLocaleString();
            const now = new Date();
            if (dueDate < now) dueBadge = '<span class="badge danger">Overdue</span>';
            else if ((dueDate - now) < 24*60*60*1000) dueBadge = '<span class="badge warning">Due soon</span>';
            else dueBadge = '<span class="badge success">Scheduled</span>';
        }
        let successRate = 'N/A'; let successBadge = '';
        if (card.practiced && (card.timesShown || 0) > 0) {
            successRate = `${((card.successRate || 0) * 100).toFixed(1)}%`;
            if ((card.successRate || 0) >= 0.7) successBadge = '<span class="badge success">Good</span>';
            else if ((card.successRate || 0) >= 0.5) successBadge = '<span class="badge warning">Needs work</span>';
            else successBadge = '<span class="badge danger">Poor</span>';
        }
        const knownStatus = card.known ? 'Yes' : 'No';
        const knownBadge = card.known ? '<span class="badge success">Known</span>' : '<span class="badge warning">Learning</span>';
        let noteDisplay = card.note || '';
        if (noteDisplay.length > 50) noteDisplay = noteDisplay.substring(0,50) + '...';
        const genderDisplay = card.gender ? card.gender.charAt(0).toUpperCase() + card.gender.slice(1) : '';
        row.innerHTML = `
            <td>${card.word}</td>
            <td>${card.meaning}</td>
            <td>${genderDisplay}</td>
            <td>${noteDisplay}</td>
            <td>${card.practiced ? 'Yes' : 'No'}</td>
            <td>${successRate} ${successBadge}</td>
            <td>${nextDue} ${dueBadge}</td>
            <td>${knownStatus} ${knownBadge}</td>
            <td class="action-buttons">
                <button class="mark-known-btn" data-id="${card.id}">${card.known ? 'Mark Unknown' : 'Mark Known'}</button>
                <button class="delete-card-btn danger" data-id="${card.id}">Delete</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
    document.querySelectorAll('.mark-known-btn').forEach(btn => {
        btn.addEventListener('click', (e)=> {
            const cardId = e.target.dataset.id; toggleCardKnownStatus(cardId);
        });
    });
    document.querySelectorAll('.delete-card-btn').forEach(btn => {
        btn.addEventListener('click', (e)=> {
            const cardId = e.target.dataset.id; deleteCardFromStats(cardId);
        });
    });
}

function toggleCardKnownStatus(cardId) {
    const card = cards.find(c => c.id === cardId);
    if (card) {
        card.known = !card.known;
        saveCards(); updateDashboard();
        const activeFilter = document.querySelector('.filter-btn.active').id;
        let filterType = 'all';
        if (activeFilter === 'availableNowFilter') filterType = 'availableNow';
        if (activeFilter === 'neverPracticedFilter') filterType = 'neverPracticed';
        if (activeFilter === 'knownWordsFilter') filterType = 'knownWords';
        showStatistics(filterType);
    }
}

function deleteCardFromStats(cardId) {
    const card = cards.find(c => c.id === cardId);
    if (card && confirm(`Are you sure you want to delete the card "${card.word}"?`)) {
        const cardIndex = cards.findIndex(c => c.id === cardId);
        if (cardIndex !== -1) {
            cards.splice(cardIndex,1);
            saveCards(); updateDashboard();
            const activeFilter = document.querySelector('.filter-btn.active').id;
            let filterType = 'all';
            if (activeFilter === 'availableNowFilter') filterType = 'availableNow';
            if (activeFilter === 'neverPracticedFilter') filterType = 'neverPracticed';
            if (activeFilter === 'knownWordsFilter') filterType = 'knownWords';
            showStatistics(filterType);
        }
    }
}

function sortTable(columnName) {
    const header = document.querySelector(`th[data-sort="${columnName}"]`);
    const currentDirection = header.dataset.sortDirection;
    document.querySelectorAll('th[data-sort]').forEach(h => { h.dataset.sortDirection = 'none'; h.classList.remove('sorted-asc','sorted-desc'); });
    if (currentDirection === 'none' || currentDirection === 'desc') { header.dataset.sortDirection = 'asc'; header.classList.add('sorted-asc'); }
    else { header.dataset.sortDirection = 'desc'; header.classList.add('sorted-desc'); }
    const activeFilter = document.querySelector('.filter-btn.active').id;
    let filterType = 'all';
    if (activeFilter === 'availableNowFilter') filterType = 'availableNow';
    if (activeFilter === 'neverPracticedFilter') filterType = 'neverPracticed';
    if (activeFilter === 'knownWordsFilter') filterType = 'knownWords';
    showStatistics(filterType);
}

// Import plain text (word // meaning // gender // note // image)
function importCards(file) {
    const reader = new FileReader();
    reader.onload = function(e) { parseAndImport(e.target.result); };
    reader.readAsText(file);
}

function parseAndImport(content) {
    const lines = content.split(/\r?\n/);
    let importedCount = 0, updatedCount = 0;
    lines.forEach(line => {
        const parts = line.split(/\s*\/\/\s*/).map(s => s.trim());
        if (parts.length < 2) return;
        const word = parts[0], meaning = parts[1];
        let gender = '', note = '', image = '';
        
        // Parse fields based on length
        if (parts.length === 3) {
            // Could be gender or note
            if (['masculine', 'feminine', 'neutral'].includes(parts[2].toLowerCase())) {
                gender = parts[2].toLowerCase();
            } else {
                note = parts[2];
            }
        } else if (parts.length === 4) {
            // Could be gender + note or note + image
            if (['masculine', 'feminine', 'neutral'].includes(parts[2].toLowerCase())) {
                gender = parts[2].toLowerCase();
                note = parts[3];
            } else {
                note = parts[2];
                image = parts[3];
            }
        } else if (parts.length >= 5) {
            gender = ['masculine', 'feminine', 'neutral'].includes(parts[2].toLowerCase()) ? parts[2].toLowerCase() : '';
            note = parts[3] || '';
            image = parts[4] || '';
        }
        
        if (word && meaning) {
            const existingIndex = cards.findIndex(c => c.word === word && c.listId === currentListId);
            if (existingIndex >= 0) {
                cards[existingIndex].meaning = meaning;
                cards[existingIndex].gender = gender;
                cards[existingIndex].note = note;
                if (image) cards[existingIndex].image = image;
                updatedCount++;
            } else {
                cards.push({
                    id: generateId(), word, meaning, gender, note, image: image || '', audio:'', practiced:false, known:false,
                    timesShown:0, correctCount:0, wrongCount:0, successRate:0, lastAskedAt:null, scheduleIndex:0, nextDueAt:null, listId: currentListId
                });
                importedCount++;
            }
        }
    });
    saveCards(); updateDashboard();
    document.getElementById('importResult').innerHTML = `<div class="feedback correct">Import completed!<br>${importedCount} new cards imported<br>${updatedCount} existing cards updated</div>`;
}

// Add single card
function addSingleCard() {
    const word = document.getElementById('wordInput').value.trim();
    const meaning = document.getElementById('meaningInput').value.trim();
    const gender = document.getElementById('genderInputImport').value;
    const note = document.getElementById('noteInputImport').value.trim();
    const image = document.getElementById('imageInputImport').value.trim();
    if (!word || !meaning) { alert('Please enter both word and meaning'); return; }
    const existingIndex = cards.findIndex(c => c.word === word && c.listId === currentListId);
    if (existingIndex >= 0) {
        cards[existingIndex].meaning = meaning;
        cards[existingIndex].gender = gender;
        cards[existingIndex].note = note;
        if (image) cards[existingIndex].image = image;
        alert('Card updated successfully!');
    } else {
        cards.push({
            id: generateId(), word, meaning, gender, note, image: image || '', audio:'', practiced:false, known:false,
            timesShown:0, correctCount:0, wrongCount:0, successRate:0, lastAskedAt:null, scheduleIndex:0, nextDueAt:null, listId: currentListId
        });
        alert('Card added successfully!');
    }
    document.getElementById('wordInput').value=''; 
    document.getElementById('meaningInput').value=''; 
    document.getElementById('genderInputImport').value='';
    document.getElementById('noteInputImport').value=''; 
    document.getElementById('imageInputImport').value='';
    saveCards(); updateDashboard();
}

// Create new list
function createNewList() {
    const listName = document.getElementById('newListName').value.trim();
    if (!listName) { alert('Please enter a list name'); return; }
    const newList = { id: generateId(), name: listName, createdAt: new Date().toISOString() };
    lists.push(newList); saveLists();
    document.getElementById('newListName').value='';
    currentListId = newList.id; localStorage.setItem(CURRENT_LIST_KEY, currentListId);
    loadCards(); renderLists(); updateDashboard(); closeSideNav();
}

function wipeAllData() {
    if (confirm('Are you sure you want to delete all cards? This action cannot be undone.')) {
        cards = []; saveCards(); updateDashboard(); alert('All data has been wiped.');
    }
}

// Export metadata (CSV) — includes gender field now
function exportMetadata() {
    const storedCards = localStorage.getItem(STORAGE_KEY);
    const allCards = storedCards ? JSON.parse(storedCards) : [];
    const storedLists = localStorage.getItem(LISTS_STORAGE_KEY);
    const allLists = storedLists ? JSON.parse(storedLists) : [];
    const currentList = localStorage.getItem(CURRENT_LIST_KEY);

    const header = ['type','id','word','meaning','gender','note','image','audio','practiced','known','timesShown','correctCount','wrongCount','successRate','lastAskedAt','scheduleIndex','nextDueAt','listId','listName','createdAt'];
    let csvLines = [];
    csvLines.push(arrayToCsvLine(header));

    // lists
    allLists.forEach(list => {
        const line = ['list', list.id || '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', list.name || '', list.createdAt || ''];
        csvLines.push(arrayToCsvLine(line));
    });

    // cards
    allCards.forEach(card => {
        const list = allLists.find(l => l.id === card.listId);
        const listName = list ? list.name : '';
        const line = [
            'card',
            card.id || '',
            card.word || '',
            card.meaning || '',
            card.gender || '',
            card.note || '',
            card.image || '',
            card.audio || '',
            card.practiced ? 'true' : 'false',
            card.known ? 'true' : 'false',
            card.timesShown || 0,
            card.correctCount || 0,
            card.wrongCount || 0,
            card.successRate || 0,
            card.lastAskedAt || '',
            card.scheduleIndex || 0,
            card.nextDueAt || '',
            card.listId || '',
            listName,
            ''
        ];
        csvLines.push(arrayToCsvLine(line));
    });

    const csvContent = csvLines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().slice(0,10);
    link.setAttribute('href', url);
    link.setAttribute('download', `vocabulary-flashcards-backup-${date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    alert('Metadata exported successfully!');
}

function arrayToCsvLine(arr) { return arr.map(f => escapeCsvField(f)).join(','); }

function escapeCsvField(field) {
    if (field === null || field === undefined) return '';
    const string = String(field);
    if (string.includes(',') || string.includes('"') || string.includes('\n')) {
        return '"' + string.replace(/"/g, '""') + '"';
    }
    return string;
}

// Import metadata CSV — includes gender field
function importMetadata(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        const lines = content.split(/\r?\n/);
        let importedLists = [];
        let importedCards = [];
        let startIndex = 0;
        if (lines.length > 0) {
            const first = lines[0].trim().toLowerCase();
            if (first.startsWith('type,') || (first.includes('word') && first.includes('meaning'))) startIndex = 1;
        }
        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const fields = parseCsvLine(line);
            const rowType = (fields[0] || '').toLowerCase();
            if (rowType === 'list') {
                const listId = fields[1] || generateId();
                const listName = fields[18] || fields[17] || `List ${listId}`;
                const createdAt = fields[19] || new Date().toISOString();
                importedLists.push({ id: listId, name: listName, createdAt });
            } else if (rowType === 'card') {
                const cardId = fields[1] || generateId();
                const word = fields[2] || '';
                const meaning = fields[3] || '';
                const gender = fields[4] || '';
                const note = fields[5] || '';
                const image = fields[6] || '';
                const audio = fields[7] || '';
                const practiced = (fields[8] || 'false').toLowerCase() === 'true';
                const known = (fields[9] || 'false').toLowerCase() === 'true';
                const timesShown = parseInt(fields[10]) || 0;
                const correctCount = parseInt(fields[11]) || 0;
                const wrongCount = parseInt(fields[12]) || 0;
                const successRate = parseFloat(fields[13]) || 0;
                const lastAskedAt = fields[14] || null;
                const scheduleIndex = parseInt(fields[15]) || 0;
                const nextDueAt = fields[16] || null;
                const listId = fields[17] || currentListId || null;
                importedCards.push({
                    id: cardId, word, meaning, gender, note, image, audio, practiced, known, timesShown, correctCount, wrongCount, successRate, lastAskedAt, scheduleIndex, nextDueAt, listId
                });
            } else {
                // ignore
            }
        }
        if (!importedLists.length && !importedCards.length) { alert('No lists or cards detected in the CSV.'); return; }
        if (!confirm('Importing metadata will replace your current lists and cards. Continue?')) return;
        if (importedLists.length === 0) {
            const uniqListIds = [...new Set(importedCards.map(c=>c.listId).filter(Boolean))];
            if (uniqListIds.length > 0) {
                uniqListIds.forEach(id => importedLists.push({ id, name: `List ${id}`, createdAt: new Date().toISOString() }));
            } else {
                importedLists.push({ id: generateId(), name: 'Default List', createdAt: new Date().toISOString() });
                importedCards = importedCards.map(c => { if (!c.listId) c.listId = importedLists[0].id; return c; });
            }
        }
        localStorage.setItem(LISTS_STORAGE_KEY, JSON.stringify(importedLists));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(importedCards));
        if (importedLists.length > 0) localStorage.setItem(CURRENT_LIST_KEY, importedLists[0].id);
        init();
        alert('Metadata imported successfully!');
    };
    reader.readAsText(file);
}

// CSV parsing with quote handling
function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                current += '"'; i++;
            } else inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current); current = '';
        } else current += char;
    }
    result.push(current);
    return result;
}

function handleMetadataImport() {
    const input = document.getElementById('metadataFileInput');
    if (!input) return;
    input.value = '';
    input.focus();
    input.click();
}

function updateLanguageSelector() {
    const storedLanguage = localStorage.getItem('vocabularyFlashcardsLanguage');
    if (storedLanguage) document.getElementById('languageSelect').value = storedLanguage;
    applyTranslations();
}

function applyTranslations() {
    const language = document.getElementById('languageSelect').value;
    localStorage.setItem('vocabularyFlashcardsLanguage', language);
    // minimal translations (same as before)
    const texts = {
        en: { title:'Vocabulary Flashcards', subtitle:'Learn and practice vocabulary with spaced repetition', learnNewBtn:'Learn New Words', practiceLearnedBtn:'Practice Learned Words', viewStatsBtn:'View Statistics', importBtn:'Import Cards', exportMetadataBtn:'Export Metadata', importMetadataBtn:'Import Metadata', wipeAllBtn:'Wipe All Data', createListBtn:'Create New List', addSingleCardBtn:'Add Card', processImportBtn:'Process Import', backToDashboardBtn:'Back to Dashboard', summaryBtn:'Back to Dashboard', backFromStatsBtn:'Back to Dashboard', backFromImportBtn:'Back to Dashboard', availableNowFilter:'Available Now', neverPracticedFilter:'Never Practiced', knownWordsFilter:'Known Words', allCardsFilter:'All Cards', markKnownBtn:'Mark as Known', editNoteBtn:'Add Note', deleteCardBtn:'Delete Card' },
        pl: { title:'Fiszki Słownictwa', subtitle:'Ucz się i ćwicz słownictwo z powtórkami spaced', learnNewBtn:'Ucz się nowych słów', practiceLearnedBtn:'Ćwicz opanowane słowa', viewStatsBtn:'Pokaż statystyki', importBtn:'Importuj fiszki', exportMetadataBtn:'Eksportuj metadane', importMetadataBtn:'Importuj metadane', wipeAllBtn:'Usuń wszystkie dane', createListBtn:'Utwórz nową listę', addSingleCardBtn:'Dodaj fiszkę', processImportBtn:'Przetwórz import', backToDashboardBtn:'Powrót do pulpitu', summaryBtn:'Powrót do pulpitu', backFromStatsBtn:'Powrót do pulpitu', backFromImportBtn:'Powrót do pulpitu', availableNowFilter:'Dostępne teraz', neverPracticedFilter:'Nigdy nie ćwicze', knownWordsFilter:'Znane słowa', allCardsFilter:'Wszystkie fiszki', markKnownBtn:'Oznacz jako znane', editNoteBtn:'Dodaj notatkę', deleteCardBtn:'Usuń fiszkę' },
        tr: { title:'Kelime Kartları', subtitle:'Spaced repetition ile kelime öğrenin ve pratik yapın', learnNewBtn:'Yeni Kelimeler Öğren', practiceLearnedBtn:'Öğrenilenleri Pratik Yap', viewStatsBtn:'İstatistikleri Görüntüle', importBtn:'Kartları İçeri Aktar', exportMetadataBtn:'Metaveriyi Dışa Aktar', importMetadataBtn:'Metaveriyi İçe Aktar', wipeAllBtn:'Tüm Verileri Sil', createListBtn:'Yeni Liste Oluştur', addSingleCardBtn:'Kart Ekle', processImportBtn:'İçe Aktarımı İşle', backToDashboardBtn:'Panoya Dön', summaryBtn:'Panoya Dön', backFromStatsBtn:'Panoya Dön', backFromImportBtn:'Panoya Dön', availableNowFilter:'Şimdi Kullanılabilir', neverPracticedFilter:'Hiç Çalışılmadı', knownWordsFilter:'Bilinen Kelimeler', allCardsFilter:'Tüm Kartlar', markKnownBtn:'Bildi Olarak İşaretle', editNoteBtn:'Not Ekle', deleteCardBtn:'Kartı Sil' }
    };
    const t = texts[language] || texts.en;
    document.querySelector('h1').textContent = t.title;
    document.querySelector('header p').textContent = t.subtitle;
    document.getElementById('learnNewBtn').textContent = t.learnNewBtn;
    document.getElementById('practiceLearnedBtn').textContent = t.practiceLearnedBtn;
    document.getElementById('viewStatsBtn').textContent = t.viewStatsBtn;
    document.getElementById('importBtn').textContent = t.importBtn;
    document.getElementById('exportMetadataBtn').textContent = t.exportMetadataBtn;
    document.getElementById('importMetadataBtn').textContent = t.importMetadataBtn;
    document.getElementById('wipeAllBtn').textContent = t.wipeAllBtn;
    document.getElementById('createListBtn').textContent = t.createListBtn;
    document.getElementById('addSingleCardBtn').textContent = t.addSingleCardBtn;
    document.getElementById('processImportBtn').textContent = t.processImportBtn;
    document.getElementById('backToDashboardBtn').textContent = t.backToDashboardBtn;
    document.getElementById('summaryBtn').textContent = t.summaryBtn;
    document.getElementById('backFromStatsBtn').textContent = t.backFromStatsBtn;
    document.getElementById('backFromImportBtn').textContent = t.backFromImportBtn;
    document.getElementById('availableNowFilter').textContent = t.availableNowFilter;
    document.getElementById('neverPracticedFilter').textContent = t.neverPracticedFilter;
    document.getElementById('knownWordsFilter').textContent = t.knownWordsFilter;
    document.getElementById('allCardsFilter').textContent = t.allCardsFilter;
    document.getElementById('markKnownBtn').textContent = t.markKnownBtn;
    document.getElementById('editNoteBtn').textContent = t.editNoteBtn;
    document.getElementById('deleteCardBtn').textContent = t.deleteCardBtn;
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length -1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i+1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Side nav
function openSideNav(){ sideNav.classList.add('open'); overlay.classList.add('show'); sideNav.setAttribute('aria-hidden','false'); document.body.style.overflow = 'hidden'; const firstInput = sideNav.querySelector('input, button'); if (firstInput) firstInput.focus(); }
function closeSideNav(){ sideNav.classList.remove('open'); overlay.classList.remove('show'); sideNav.setAttribute('aria-hidden','true'); document.body.style.overflow = ''; if (burgerBtn) burgerBtn.focus(); }
function toggleSideNav(){ if (sideNav.classList.contains('open')) closeSideNav(); else openSideNav(); }

// Event listeners and wiring
function setupEventListeners() {
    document.getElementById('learnNewBtn').addEventListener('click', startLearnSession);
    document.getElementById('practiceLearnedBtn').addEventListener('click', startPracticeSession);
    document.getElementById('viewStatsBtn').addEventListener('click', ()=> { showStatistics('availableNow'); showView('stats'); });
    document.getElementById('importBtn').addEventListener('click', ()=> showView('import'));
    document.getElementById('exportMetadataBtn').addEventListener('click', exportMetadata);
    document.getElementById('importMetadataBtn').addEventListener('click', handleMetadataImport);
    document.getElementById('wipeAllBtn').addEventListener('click', wipeAllData);
    document.getElementById('createListBtn').addEventListener('click', createNewList);
    document.getElementById('backToDashboardBtn').addEventListener('click', ()=> showView('dashboard'));
    document.getElementById('summaryBtn').addEventListener('click', ()=> showView('dashboard'));
    document.getElementById('backFromStatsBtn').addEventListener('click', ()=> showView('dashboard'));
    document.getElementById('backFromImportBtn').addEventListener('click', ()=> showView('dashboard'));
    document.getElementById('processImportBtn').addEventListener('click', ()=> {
        const fileInput = document.getElementById('fileInput');
        if (fileInput.files.length > 0) importCards(fileInput.files[0]);
        else alert('Please select a file to import.');
    });
    document.getElementById('processPasteBtn').addEventListener('click', ()=> {
        const content = document.getElementById('pasteInput').value;
        if (!content || content.trim() === '') { alert('Please paste word // meaning pairs into the text area before importing.'); return; }
        parseAndImport(content); document.getElementById('pasteInput').value = '';
    });
    document.getElementById('metadataFileInput').addEventListener('change', (e)=> { if (e.target.files.length > 0) importMetadata(e.target.files[0]); });
    document.getElementById('addSingleCardBtn').addEventListener('click', addSingleCard);
    document.getElementById('availableNowFilter').addEventListener('click', ()=> { setActiveFilter('availableNowFilter'); showStatistics('availableNow'); });
    document.getElementById('neverPracticedFilter').addEventListener('click', ()=> { setActiveFilter('neverPracticedFilter'); showStatistics('neverPracticed'); });
    document.getElementById('knownWordsFilter').addEventListener('click', ()=> { setActiveFilter('knownWordsFilter'); showStatistics('knownWords'); });
    document.getElementById('allCardsFilter').addEventListener('click', ()=> { setActiveFilter('allCardsFilter'); showStatistics('all'); });
    document.querySelectorAll('th[data-sort]').forEach(header => header.addEventListener('click', ()=> sortTable(header.dataset.sort)));
    document.getElementById('languageSelect').addEventListener('change', applyTranslations);
    document.getElementById('markKnownBtn').addEventListener('click', markCurrentCardAsKnown);
    document.getElementById('editNoteBtn').addEventListener('click', showNoteModal);
    document.getElementById('deleteCardBtn').addEventListener('click', deleteCurrentCard);
    saveNoteBtn.addEventListener('click', saveNote);
    cancelNoteBtn.addEventListener('click', closeNoteModal);
    noteModal.addEventListener('click', (e)=> { if (e.target === noteModal) closeNoteModal(); });
    // Edit word modal listeners
    const editWordBtn = document.getElementById('editWordBtn'); // button you added into cardActions
    if (editWordBtn) editWordBtn.addEventListener('click', showEditWordModal);
    if (saveEditWordBtn) saveEditWordBtn.addEventListener('click', saveEditWord);
    if (cancelEditWordBtn) cancelEditWordBtn.addEventListener('click', closeEditWordModal);
    // close modal when clicking outside
    if (editWordModal) editWordModal.addEventListener('click', (e) => { if (e.target === editWordModal) closeEditWordModal(); });

    const nightBtn = document.getElementById('nightModeToggle'); if (nightBtn) nightBtn.addEventListener('click', toggleNightMode);
    if (burgerBtn) burgerBtn.addEventListener('click', (e)=> { e.stopPropagation(); toggleSideNav(); });
    if (overlay) overlay.addEventListener('click', ()=> closeSideNav());
    document.addEventListener('keydown', (e)=> { if (e.key === 'Escape' && sideNav.classList.contains('open')) closeSideNav(); });
    sideNav.addEventListener('click', (e)=> e.stopPropagation());

    // Audio controls
    if (playAudioBtn) playAudioBtn.addEventListener('click', playAudioForCurrentCard);
    if (recordAudioBtn) recordAudioBtn.addEventListener('click', handleRecordButton);

    // Mark-known/delete buttons on stats are handled in showStatistics
}

function setActiveFilter(activeId) {
    document.querySelectorAll('.filter-btn').forEach(btn=> btn.classList.remove('active'));
    document.getElementById(activeId).classList.add('active');
}

// ---------- Audio: play / record ----------
function updateAudioUIForCard(card) {
    // Play button visibility
    if (card && card.audio && card.audio.trim() !== '') {
        playAudioBtn.style.display = 'inline-flex';
        playAudioBtn.disabled = false;
    } else {
        playAudioBtn.style.display = 'none';
        playAudioBtn.disabled = true;
    }

    // Record button label: "Record" vs "Override Recording"
    if (card && card.audio && card.audio.trim() !== '') {
        recordAudioBtn.textContent = '🎙️ Override Recording';
        recordAudioBtn.title = 'Override existing recording';
    } else {
        recordAudioBtn.textContent = '🎙️ Record';
        recordAudioBtn.title = 'Record pronunciation';
    }
}

async function handleRecordButton() {
    // Toggle behaviour: start recording if not recording, otherwise stop and save
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        stopRecordingAndSave();
        return;
    }
    // Start recording
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('Recording is not supported in this browser.');
            return;
        }
        // request audio
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(mediaStream);
        recordedChunks = [];
        mediaRecorder.ondataavailable = function(e) {
            if (e.data && e.data.size > 0) recordedChunks.push(e.data);
        };
        mediaRecorder.onstop = function() {
            // convert to base64 data URL
            const blob = new Blob(recordedChunks, { type: recordedChunks[0] ? recordedChunks[0].type : 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = function() {
                const base64data = reader.result; // data:...base64...
                // save to card
                const card = currentSession.cards[currentSession.currentIndex];
                if (card) {
                    card.audio = base64data;
                    saveCards();
                    updateAudioUIForCard(card);
                    // stop the media stream tracks
                    if (mediaStream) {
                        mediaStream.getTracks().forEach(t => t.stop());
                        mediaStream = null;
                    }
                    mediaRecorder = null;
                    recordedChunks = [];
                    alert('Recording saved.');
                }
            };
            reader.readAsDataURL(blob);
        };
        mediaRecorder.start();
        // Update UI while recording
        recordAudioBtn.textContent = '⏹️ Stop & Save';
        recordAudioBtn.title = 'Stop and save recording';
    } catch (err) {
        console.error('Recording failed:', err);
        alert('Could not start recording. Please check microphone permissions and try again.');
    }
}

function stopRecordingAndSave() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        // the onstop handler will save the data
        recordAudioBtn.textContent = 'Saving...';
        recordAudioBtn.disabled = true;
        // re-enable after small delay handled in onstop, but set a fallback
        setTimeout(()=> { recordAudioBtn.disabled = false; }, 1500);
    }
}

function playAudioForCurrentCard() {
    const card = currentSession.cards[currentSession.currentIndex];
    if (!card || !card.audio) {
        alert('No recording available for this card.');
        return;
    }
    try {
        const audio = new Audio(card.audio);
        audio.play().catch(err => {
            console.error('Play failed:', err);
            alert('Unable to play audio on this device/browser.');
        });
    } catch (err) {
        console.error('Play failed:', err);
        alert('Unable to play audio on this device/browser.');
    }
}

// ---------- End Audio ----------

// Initialize app
document.addEventListener('DOMContentLoaded', init);