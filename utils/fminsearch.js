export function fminsearch(fun, Parm0, x, y, Opt) {
    if (!Opt.step) { // initial step is 1/100 of initial value (remember not to use zero in Parm0)
        Opt.step = Parm0.map(function(p) {
            return p / 10;
        });
        Opt.step = Opt.step.map(function(si) {
            if (si === 0) {
                return 1;
            }
            else {
                return si;
            }
        }); // convert null steps into 1's
    }
    if (typeof (Opt.display) == 'undefined') {
        Opt.display = true;
    }

    var cloneVector = function(V) {
        return V.map(function(v) {
            return v;
        });
    };
    var ya, y0, yb, fP0, fP1;
    var P0 = cloneVector(Parm0), P1 = cloneVector(Parm0);
    var n = P0.length;
    var step = Opt.step;
    var funParm = function(P) {
        return Opt.objFun(fun(P), y);
    };

    const targetError = Opt.targetError || 0.01; // Set target error (default 0.01 if not provided)

    for (var i = 0; i < Opt.maxIter; i++) {
        //P1 = cloneVector(P0);
        for (var j = 0; j < n; j++) { // take a step for each parameter
            P1 = cloneVector(P0);
            P1[j] += step[j];
            if (funParm(P1) < funParm(P0)) { // if parm value going in the righ direction
                step[j] = 1.2 * step[j]; // go a little faster
                P0 = cloneVector(P1);
            }
            else { // if not
                step[j] = -(0.5 * step[j]); // reverse and go slower
            }
        }

        // Check if error is below target
        const currentError = funParm(P0);
        console.log('Current Error: ', currentError);
        // if (currentError <= targetError) {
        //     console.log(`Target error of ${targetError} reached at iteration ${i + 1}.`);
        //     break; // Stop if the error is below the threshold
        // }

        if (Opt.display) {
            if (i > (Opt.maxIter - Opt.maxIter * 1)) {
                console.log('Iteration: ', i + 1, 'Error: ', currentError, 'k, b: ', P0);
            }
        }
    }

    return P0;
}