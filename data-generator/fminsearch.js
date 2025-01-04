export function fminsearch(fun, Parm0, y, Opt) {
    if (!Opt) {
        Opt = {};
    }

    if (!Opt.maxIter) {
        Opt.maxIter = 1000;
    }

    if (!Opt.step) {// initial step is 1/100 of initial value (remember not to use zero in Parm0)
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
        Opt.display = 'console';
    }

    if (!Opt.objFun) {
        Opt.objFun = function(y, yp) {
            return y.map(function(yi, i) {
                return Math.pow((yi - yp[i]), 2);
            }).reduce(function(a, b) {
                return a + b;
            });
        };
    } // SSD default objective function being minimized
    let regModel = {};
    var ya, y0, yb, fP0, fP1;
    var P0 = [...Parm0], P1 = [...Parm0]; // clone parameter array to decouple passing by reference
    var n = P0.length;
    var step = Opt.step;

    function funEval(P) {
        return Opt.objFun(fun(P), y);
    }//function evaluation for curent Parameter values to determine value of objective function, passed as a Opt parameter (Opt.objFun)
    // silly multi-univariate walk
    // assemble regresssion Model
    regModel = {
        Opt: Opt,
        y: y,
        parmi: P0, // initial parameter values
        fun: fun
    };
    for (var i = 0; i < Opt.maxIter; i++) {
        P1 = [...P0];
        for (var j = 0; j < n; j++) { // take a step for each parameter
            P1[j] += step[j];
            console.log('Eval 1 - Eval 0', funEval(P1), funEval(P0));
            if (funEval(P1) < funEval(P0)) { // if parm value going in the righ direction
                step[j] = 1.2 * step[j]; // then go a little faster
                P0 = [...P1];
            }
            else {
                if (i === 1) {
                    step[j] = 1.2 * step[j]; // then go a little faster
                }
                else {
                    step[j] = -(0.5 * step[j]); // otherwise reverse and go slower

                }
            }
        }
        if (Opt.display === 'console') {
            if (i > Opt.maxIter * 0.5) {
                console.log('  i  ', '  ObjFun ', '  Parms ');
            }
            console.log(i + 1, P0);
        }

        //{if(i>(Opt.maxIter-10)){console.log(i+1,funEval(P0),P0)}}
    }
    regModel.parmf = P0; // final parameter values
    return regModel;
}