import React from "react";
import Split from "react-split";
import "./SplitPanel.css"; // For styling

const SplitPanel = () => {
  return (
    <Split
      className="split-container"
      sizes={[50, 50]} // Initial sizes (percent)
      minSize={100} // Minimum size of each panel
      gutterSize={8} // Width of draggable gutter
    >
      {/* Panel 1 */}
      <div class="search-results-container">
        <div class='panel-menu'>
            <div class='panel-header'> 
                <div class='panel-header-text'><strong>Results</strong></div>
            </div>
        </div>
			{response && <p style={{ marginTop: '20px' }}>{handleResponse(response)}</p>}
		</div>

      {/* Panel 2 */}
        <div id='fulltext' class="full-text-container">
            <div class='panel-menu'>
                <div class='panel-header'> 
                    <div class='panel-header-text'><strong>Text</strong></div>
                </div>
                {book && handleDisplayBook()}
            </div>
            {fullText && handleFullText()}
        </div>
    </Split>
  );
};

export default SplitPanel;
