'use strict';
// Verrou "diagram" (pattern façon Android). Vanilla JS, aucune dépendance.
(function (window) {
    const svgns = 'http://www.w3.org/2000/svg';

    function vibrate() {
        if (navigator.vibrate) {
            navigator.vibrate(25);
        }
    }

    function PatternLock(element, options) {
        const svg = typeof element === 'string' ? document.querySelector(element) : element;
        const self = this;
        const root = svg;
        const dots = Array.from(svg.querySelectorAll('.lock-dots circle'));
        const lines = svg.querySelector('.lock-lines');
        const actives = svg.querySelector('.lock-actives');
        const pt = root.createSVGPoint();
        let code = [];
        let currentline;
        let currenthandler;

        options = Object.assign({}, PatternLock.defaults, options || {});

        options.hideLine ? hideLine() : showLine();

        function onStart(e) {
            clear();
            e.preventDefault();
            disableScroll();
            const moveEventName = e.type === 'touchstart' ? 'touchmove' : 'mousemove';
            currenthandler = null;
            svg.addEventListener(moveEventName, discoverDot);
            const endEvent = e.type === 'touchstart' ? 'touchend' : 'mouseup';
            document.addEventListener(endEvent, function onEnd() {
                document.removeEventListener(endEvent, onEnd);
                svg.removeEventListener(moveEventName, discoverDot);
                end();
            }, { once: true });
        }
        svg.addEventListener('touchstart', onStart, { passive: false });
        svg.addEventListener('mousedown', onStart);

        Object.assign(this, {
            clear: clear,
            success: success,
            error: error,
            getPattern: getPattern,
            switchHide: switchHide
        });

        function success() {
            svg.classList.remove('error');
            svg.classList.add('success');
        }

        function error() {
            svg.classList.remove('success');
            svg.classList.add('error');
        }

        function switchHide() {
            options.hideLine = !options.hideLine;
            options.hideLine ? hideLine() : showLine();
        }

        function hideLine() {
            document.querySelectorAll('g.lock-lines').forEach(g => g.classList.add('hide-lines'));
        }

        function showLine() {
            document.querySelectorAll('g.lock-lines').forEach(g => g.classList.remove('hide-lines'));
        }

        function getPattern() {
            const patternResult = { rspCode: '0000', pattern: null };
            patternResult.rspCode = doConditionCheck();
            if (patternResult.rspCode === '0000') {
                patternResult.pattern = parseInt(code.map(function (i) {
                    return dots.indexOf(i) + 1;
                }).join(''));
            }
            return patternResult;
        }

        function doConditionCheck() {
            const resultLength = code.length;
            if (options.checkMin && resultLength < options.min) return '1001';
            if (options.checkMax && resultLength > options.max) return '1002';
            return '0000';
        }

        function end() {
            enableScroll();
            stopTrack(currentline);
            currentline && currentline.remove();
            const val = options.onPattern.call(self, getPattern());
            if (val === true) success();
            else if (val === false) error();
        }

        function clear() {
            code = [];
            currentline = undefined;
            currenthandler = undefined;
            svg.classList.remove('success', 'error');
            lines.innerHTML = '';
            actives.innerHTML = '';
        }

        function preventDefault(e) {
            e = e || window.event;
            if (e.preventDefault) e.preventDefault();
            e.returnValue = false;
        }

        const scrollKeys = { 37: true, 38: true, 39: true, 40: true, 32: true, 34: true, 35: true, 36: true };
        function preventDefaultForScrollKeys(e) {
            if (scrollKeys[e.keyCode]) {
                preventDefault(e);
                return false;
            }
        }

        function disableScroll() {
            window.addEventListener('DOMMouseScroll', preventDefault, false);
            window.onwheel = preventDefault;
            window.onmousewheel = document.onmousewheel = preventDefault;
            window.ontouchmove = preventDefault;
            document.onkeydown = preventDefaultForScrollKeys;
        }

        function enableScroll() {
            window.removeEventListener('DOMMouseScroll', preventDefault, false);
            window.onmousewheel = document.onmousewheel = null;
            window.onwheel = null;
            window.ontouchmove = null;
            document.onkeydown = null;
        }

        function isUsed(target) {
            if (options.allowRepeat) return checkIsUsedUnderAllowedRepeat(target);
            return code.includes(target);
        }

        function checkIsUsedUnderAllowedRepeat(target) {
            if (code.length === 0) return false;
            return target === code[code.length - 1];
        }

        function isAvailable(target) {
            return dots.includes(target);
        }

        function updateLine(line) {
            return function (e) {
                e.preventDefault();
                if (currentline !== line) return;
                const pos = svgPosition(e.target, e);
                line.setAttribute('x2', pos.x);
                line.setAttribute('y2', pos.y);
                return false;
            };
        }

        function discoverDot(e, target) {
            if (!target) {
                const { x, y } = getMousePos(e);
                target = document.elementFromPoint(x, y);
            }
            if (isAvailable(target) && !isUsed(target)) {
                stopTrack(currentline, target);
                currentline = beginTrack(target);
            }
        }

        function stopTrack(line, target) {
            if (line === undefined) return;
            if (currenthandler) {
                svg.removeEventListener('touchmove', currenthandler);
                svg.removeEventListener('mousemove', currenthandler);
            }
            if (target === undefined) return;
            const x = target.getAttribute('cx');
            const y = target.getAttribute('cy');
            line.setAttribute('x2', x);
            line.setAttribute('y2', y);
        }

        function beginTrack(target) {
            code.push(target);
            const x = target.getAttribute('cx');
            const y = target.getAttribute('cy');
            const line = createNewLine(x, y);
            const marker = createNewMarker(x, y);
            actives.appendChild(marker);
            currenthandler = updateLine(line);
            svg.addEventListener('touchmove', currenthandler);
            svg.addEventListener('mousemove', currenthandler);
            lines.appendChild(line);
            if (options.vibrate) vibrate();
            return line;
        }

        function createNewMarker(x, y) {
            const marker = document.createElementNS(svgns, 'circle');
            marker.setAttribute('cx', x);
            marker.setAttribute('cy', y);
            marker.setAttribute('r', 6);
            return marker;
        }

        function createNewLine(x1, y1, x2, y2) {
            const line = document.createElementNS(svgns, 'line');
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1);
            line.setAttribute('x2', x2 === undefined ? x1 : x2);
            line.setAttribute('y2', y2 === undefined ? y1 : y2);
            return line;
        }

        function getMousePos(e) {
            return {
                x: e.clientX || e.touches[0].clientX,
                y: e.clientY || e.touches[0].clientY
            };
        }

        function svgPosition(element, e) {
            const { x, y } = getMousePos(e);
            pt.x = x;
            pt.y = y;
            return pt.matrixTransform(root.getScreenCTM().inverse());
        }
    }

    PatternLock.defaults = {
        onPattern: function () {},
        allowRepeat: false,
        hideLine: false,
        checkMin: true,
        checkMax: true,
        min: 4,
        max: 9
    };

    window.PatternLock = PatternLock;
})(window);
