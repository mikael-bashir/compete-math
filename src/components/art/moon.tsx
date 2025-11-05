import React from 'react';

const FullMoon = () => {
  return (
    <div className="wrapper">
      <div className="frame">
        <div className="background">
          <div className="sky">
            {/* Generating rings for the moon's glow */}
            {[...Array(19)].reduce((prev, _, i) => <div className={`ring${i + 1}`}>{prev}</div>,
              <div className="moon">
                <div className="moonPatches">
                  {/* Patches and details for the moon's surface */}
                  {[...Array(102)].map((_, i) => <div key={`rect-${i}`} className={`rectangle${i + 1}`}></div>)}
                  {[...Array(42)].map((_, i) => <div key={`detail-${i}`} className={`detail${i + 1}`}></div>)}
                </div>
              </div>
            )}
          </div>
          <div className="cloud-container">
            {/* Generating clouds */}
            <div className="cloud1">
                {[...Array(66)].map((_, i) => <div key={i} className={`cloud1detail${i + 1}`}></div>)}
            </div>
            <div className="cloud2">
                {[...Array(39)].map((_, i) => <div key={i} className={`cloud2detail${i + 1}`}></div>)}
            </div>
            <div className="cloud3">
                {[...Array(61)].map((_, i) => <div key={i} className={`cloud3detail${i + 1}`}></div>)}
            </div>
            <div className="cloud4">
                {[...Array(11)].map((_, i) => <div key={i} className={`cloud4detail${i + 1}`}></div>)}
            </div>
            <div className="cloud5">
                {[...Array(42)].map((_, i) => <div key={i} className={`cloud5detail${i + 1}`}></div>)}
            </div>
            <div className="cloud6">
                {[...Array(29)].map((_, i) => <div key={i} className={`cloud6detail${i + 1}`}></div>)}
            </div>
            <div className="cloud7">
                {[...Array(13)].map((_, i) => <div key={i} className={`cloud7detail${i + 1}`}></div>)}
            </div>
            <div className="cloud8">
                {[...Array(42)].map((_, i) => <div key={i} className={`cloud8detail${i + 1}`}></div>)}
            </div>
          </div>
        </div>
        <div className="top-frame"></div>
        <div className="right-frame"></div>
        <div className="bottom-frame"></div>
        <div className="left-frame"></div>
      </div>
    </div>
  );
};

export default FullMoon;

