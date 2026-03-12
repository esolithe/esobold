let displayEndpointContainer = display_endpoint_container;
display_endpoint_container = () => {
    restore_endpoint_dropdowns();
    if (localflag) {
        document.querySelector("#customapidropdown").value = 1
    }
    displayEndpointContainer();
};